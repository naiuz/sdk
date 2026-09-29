import {APIConnectionError, APITimeoutError, makeAPIError, NeuronAIError} from "../errors";
import {untilAborted, type Attempt} from "./http";
import {isRecord} from "./json";
import {connectionLost, readText} from "./parse";

/**
 * Splits a Server-Sent Events stream into its events' data, as the HTML
 * standard parses one: a line ends at \r\n, \n or \r; each `data` field adds
 * a line to the event's data; a blank line ends the event; comments and
 * other fields are skipped. An event the stream's end cuts off is dropped.
 */
export class SSEDecoder {
    #pending = "";
    #data: string[] = [];

    /** Takes the next piece of the stream's text, and returns the data of each event it completes. */
    push(text: string): string[] {
        this.#pending += text;
        const events: string[] = [];
        for (;;) {
            const end = /\r\n|\r|\n/.exec(this.#pending);
            // A \r at the very end may be the first half of a \r\n: wait for the next piece.
            if (end === null || (end[0] === "\r" && end.index === this.#pending.length - 1)) return events;
            const line = this.#pending.slice(0, end.index);
            this.#pending = this.#pending.slice(end.index + end[0].length);
            if (line === "") {
                if (this.#data.length > 0) events.push(this.#data.join("\n"));
                this.#data = [];
            } else if (line === "data" || line.startsWith("data:")) {
                const value = line.slice(5);
                this.#data.push(value.startsWith(" ") ? value.slice(1) : value);
            }
        }
    }
}

// The reasons the SDK itself aborts a stream's request with, told apart from a caller's.
const CLOSED = new NeuronAIError("The stream was closed.");
const STALLED = new NeuronAIError("The stream stalled.");

/**
 * A streamed answer: loop over it with `for await` for each chunk, as the
 * server sends it. The request stays open while you read. Leaving the loop
 * early (`break`, `return` or an error) or calling `close()` aborts it, and
 * the server stops generating. The call's timeout bounds the wait for each
 * piece of the stream, not the whole of it. A stream can be read once: read
 * it or close it.
 */
export class Stream<T> implements AsyncIterable<T> {
    readonly #response: Response;
    readonly #attempt: Attempt;
    readonly #release: () => void;
    #read = false;
    #closed = false;

    /** Takes over the attempt the answer came from: `release` unwires the caller's signal once the stream is done. */
    constructor(response: Response, attempt: Attempt, release: () => void) {
        this.#response = response;
        this.#attempt = attempt;
        this.#release = release;
    }

    [Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
        return this.#chunks();
    }

    /** Stops the stream: the request is aborted, the server stops generating, and a loop reading the stream ends. Calling it again does nothing. */
    close(): void {
        if (this.#closed) return;
        this.#closed = true;
        this.#attempt.abort(CLOSED);
        this.#release();
    }

    /**
     * The stream as bytes of newline-delimited JSON, one chunk per line, to
     * pass on, such as the body of your own Response. It reads the stream,
     * so use it in place of a loop over the stream. Cancelling it closes the
     * stream.
     */
    toReadableStream(): ReadableStream<Uint8Array> {
        const chunks = this[Symbol.asyncIterator]();
        const encoder = new TextEncoder();
        return new ReadableStream<Uint8Array>({
            async pull(controller) {
                try {
                    const next = await chunks.next();
                    if (next.done === true) controller.close();
                    else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
                } catch (error) {
                    controller.error(error);
                }
            },
            async cancel() {
                await chunks.return();
            },
        });
    }

    async *#chunks(): AsyncGenerator<T, void, undefined> {
        if (this.#read) throw new NeuronAIError("This stream has already been read: a stream can be read once.");
        this.#read = true;
        const reader = this.#response.body?.getReader();
        const decoder = new TextDecoder();
        const events = new SSEDecoder();
        try {
            for (;;) {
                const bytes = reader === undefined ? null : await this.#next(reader);
                if (this.#isClosed()) return;
                for (const data of events.push(bytes === null ? decoder.decode() : decoder.decode(bytes, {stream: true}))) {
                    if (data === "[DONE]") return;
                    yield this.#parse(data);
                    // The loop reading the stream may have closed it meanwhile.
                    if (this.#isClosed()) return;
                }
                if (bytes === null) throw new APIConnectionError("The stream ended before [DONE]: the answer may be cut short.");
            }
        } finally {
            this.close();
            if (reader !== undefined) void reader.cancel().catch(() => undefined);
        }
    }

    /** Whether close() has run: a method, so a check after an await or a yield isn't narrowed away. */
    #isClosed(): boolean {
        return this.#closed;
    }

    /** The next piece of the body, or null at its end, waiting at most the call's timeout for it. */
    async #next(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array | null> {
        const {signal, timeout} = this.#attempt;
        const timer = setTimeout(() => {
            this.#attempt.abort(STALLED);
        }, timeout);
        try {
            const {done, value} = await untilAborted(reader.read(), signal);
            return done ? null : value;
        } catch (error) {
            const reason: unknown = signal.reason;
            if (reason === CLOSED) return null;
            if (reason === STALLED) throw new APITimeoutError(`No part of the stream arrived within ${String(timeout)} ms.`);
            // The caller's signal: the stream rejects with its reason.
            signal.throwIfAborted();
            throw connectionLost(error);
        } finally {
            clearTimeout(timer);
        }
    }

    /** One event's data: a chunk, or else, as with the API's error envelope mid-stream, APIError with the answer's status. */
    #parse(data: string): T {
        let chunk: unknown;
        try {
            chunk = JSON.parse(data);
        } catch {
            // Not JSON: raised below.
        }
        if (isRecord(chunk) && !isRecord(chunk.error)) return chunk as T;
        throw makeAPIError(this.#response.status, this.#response.statusText, this.#response.headers, this.#attempt.redact(data));
    }
}

/**
 * Reads a streamed answer. One that isn't an event stream raises APIError
 * with its status. Otherwise the stream takes the attempt over: the
 * attempt's timer stops, since the stream bounds each piece by the timeout,
 * and the caller's signal still aborts it while it is read.
 */
export async function readStream<T>(response: Response, attempt: Attempt): Promise<Stream<T>> {
    if (!/^text\/event-stream/i.test(response.headers.get("content-type") ?? "")) {
        throw makeAPIError(response.status, response.statusText, response.headers, attempt.redact(await readText(response)));
    }
    attempt.disarm();
    return new Stream<T>(response, attempt, attempt.adopt());
}
