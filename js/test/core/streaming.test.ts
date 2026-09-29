import {getEventListeners} from "node:events";
import {describe, expect, it, vi} from "vitest";
import {SSEDecoder, readStream, type Stream} from "../../src/core/streaming";
import {APIConnectionError, APIError, APITimeoutError, NeuronAIError} from "../../src/errors";
import {httpClient} from "../helpers/http";
import {json, mockFetch, type SentRequest} from "../helpers/mock-fetch";

type Chunk = Record<string, unknown>;

/** The attempt's own signal, as the mock recorded it on the request: the one `untilAborted` adds its per-read listeners to. */
function requireSignal(sent: SentRequest | undefined): AbortSignal {
    if (sent?.signal == null) throw new Error("expected the request to carry a signal");
    return sent.signal;
}

const chunk = (n: number): string => JSON.stringify({object: "chat.completion.chunk", n});
const UPSTREAM_ERROR = JSON.stringify({
    error: {type: "server_error", code: "upstream_error", message: "The model is temporarily unavailable. Please try again later.", param: null},
    request_id: "req-event",
});

/** An event stream answer: each entry is one event's data. */
const sse = (events: string[]): Response =>
    new Response(events.map((data) => `data: ${data}\n\n`).join(""), {status: 200, headers: {"content-type": "text/event-stream", "x-request-id": "req-stream"}});

/** An event stream whose body the test writes piece by piece. */
function live(): {response: Response; send: (piece: string | Uint8Array) => void; end: () => void; fail: (error: Error) => void; cancelled: () => boolean} {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
        start(started) {
            controller = started;
        },
        cancel() {
            cancelled = true;
        },
    });
    return {
        response: new Response(body, {status: 200, headers: {"content-type": "text/event-stream"}}),
        send: (piece) => {
            controller?.enqueue(typeof piece === "string" ? new TextEncoder().encode(piece) : piece);
        },
        end: () => {
            controller?.close();
        },
        fail: (error) => {
            controller?.error(error);
        },
        cancelled: () => cancelled,
    };
}

/** Sends a streamed call whose answer is `response`, and resolves to the stream and the request sent. */
async function open(response: Response, options: {timeout?: number; signal?: AbortSignal} = {}): Promise<{stream: Stream<Chunk>; sent: SentRequest | undefined}> {
    const {fetch, requests} = mockFetch(response);
    const {http} = httpClient(fetch, {timeout: options.timeout ?? 1000});
    const stream = await http.request({method: "POST", path: "/chat/completions", body: {stream: true}, retry: "paid", options: {signal: options.signal}}, readStream<Chunk>);
    return {stream, sent: requests[0]};
}

/** Every chunk a loop gets, and the error that ends it, if any. */
async function collect(stream: AsyncIterable<Chunk>): Promise<{chunks: Chunk[]; error: unknown}> {
    const chunks: Chunk[] = [];
    try {
        for await (const item of stream) chunks.push(item);
    } catch (error) {
        return {chunks, error};
    }
    return {chunks, error: null};
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("SSEDecoder", () => {
    it("gives each event's data, joining its data lines with a line break", () => {
        expect(new SSEDecoder().push("data: a\ndata: b\n\ndata: c\n\n")).toEqual(["a\nb", "c"]);
    });

    it("keeps an event open until a blank line ends it", () => {
        const decoder = new SSEDecoder();
        expect(decoder.push("data: a\n")).toEqual([]);
        expect(decoder.push("\n")).toEqual(["a"]);
    });

    it("ends a line at \\r\\n, \\r or \\n, even when a \\r\\n is split between two pieces", () => {
        const decoder = new SSEDecoder();
        expect(decoder.push("data: a\r")).toEqual([]);
        expect(decoder.push("\ndata: b\n\n")).toEqual(["a\nb"]);
        expect(decoder.push("data: c\r\rdata: d\r\n\r\n")).toEqual(["c", "d"]);
    });

    it("skips comments and other fields, and takes data with or without a space after the colon", () => {
        expect(new SSEDecoder().push(": keep-alive\nevent: message\nid: 7\nretry: 1000\ndata:x\ndata\n\n")).toEqual(["x\n"]);
    });
});

describe("a stream", () => {
    it("yields each event's chunk, and ends at [DONE] whatever follows it", async () => {
        const {stream} = await open(sse([chunk(1), chunk(2), "[DONE]", chunk(3)]));
        expect(await collect(stream)).toEqual({chunks: [JSON.parse(chunk(1)), JSON.parse(chunk(2))], error: null});
    });

    it("reads the body to the end after [DONE], leaving the request's connection untouched", async () => {
        const body = live();
        const {stream, sent} = await open(body.response);
        body.send(`data: ${chunk(1)}\n\ndata: [DONE]\n\n: a comment after [DONE]\n`);
        body.end();
        const {chunks, error} = await collect(stream);
        expect(chunks).toEqual([JSON.parse(chunk(1))]);
        expect(error).toBeNull();
        expect(sent?.signal?.aborted).toBe(false);
    });

    it("gives up draining the body after [DONE] once its own limit passes, without an error", async () => {
        const body = live();
        const {stream, sent} = await open(body.response, {timeout: 50});
        body.send(`data: ${chunk(1)}\n\ndata: [DONE]\n\n`);
        const reading = collect(stream);
        await pause(10);
        expect(sent?.signal?.aborted).toBe(false);
        const {chunks, error} = await reading;
        expect(chunks).toEqual([JSON.parse(chunk(1))]);
        expect(error).toBeNull();
        expect(sent?.signal?.aborted).toBe(true);
    });

    it("clears the drain's timer once the body has ended, so nothing keeps the process alive", async () => {
        vi.useFakeTimers();
        try {
            const body = live();
            const {stream} = await open(body.response);
            body.send(`data: ${chunk(1)}\n\ndata: [DONE]\n\n`);
            body.end();
            await collect(stream);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("raises an error event as APIError with the answer's status 200, after the chunks before it", async () => {
        const {stream} = await open(sse([chunk(1), UPSTREAM_ERROR, "[DONE]"]));
        const {chunks, error} = await collect(stream);
        expect(chunks).toEqual([JSON.parse(chunk(1))]);
        expect(error).toBeInstanceOf(APIError);
        expect((error as Error).constructor).toBe(APIError);
        expect(error).toMatchObject({status: 200, type: "server_error", code: "upstream_error", request_id: "req-event"});
    });

    it("raises APIError for an event that isn't JSON", async () => {
        const {stream} = await open(sse(["not json", "[DONE]"]));
        const {error} = await collect(stream);
        expect(error).toBeInstanceOf(APIError);
        expect(error).toMatchObject({status: 200, code: null, message: "HTTP 200: not json"});
    });

    it("raises APIConnectionError when the stream ends before [DONE], rather than end as if the answer were whole", async () => {
        const {stream} = await open(sse([chunk(1)]));
        const {chunks, error} = await collect(stream);
        expect(chunks).toHaveLength(1);
        expect(error).toBeInstanceOf(APIConnectionError);
        expect((error as Error).message).toBe("The stream ended before [DONE]: the answer may be cut short.");
    });

    it("raises APIConnectionError, saying what failed, when the connection drops mid-stream", async () => {
        const body = live();
        const {stream} = await open(body.response);
        body.send(`data: ${chunk(1)}\n\n`);
        const reading = collect(stream);
        await pause(10);
        body.fail(new TypeError("terminated", {cause: new Error("other side closed")}));
        const {chunks, error} = await reading;
        expect(chunks).toHaveLength(1);
        expect(error).toBeInstanceOf(APIConnectionError);
        expect((error as Error).message).toBe("The connection failed while the response arrived: other side closed");
    });

    it("decodes a character whose UTF-8 bytes two pieces split", async () => {
        const bytes = new TextEncoder().encode('data: {"text":"Salom 👋"}\n\ndata: [DONE]\n\n');
        const split = bytes.indexOf(0xf0) + 2;
        const body = live();
        const {stream} = await open(body.response);
        body.send(bytes.slice(0, split));
        body.send(bytes.slice(split));
        body.end();
        expect((await collect(stream)).chunks).toEqual([{text: "Salom 👋"}]);
    });

    it("bounds each piece by the timeout, not the whole stream", async () => {
        const body = live();
        const {stream} = await open(body.response, {timeout: 60});
        const reading = collect(stream);
        for (let n = 1; n <= 5; n++) {
            body.send(`data: ${chunk(n)}\n\n`);
            await pause(30);
        }
        const {chunks, error} = await reading;
        expect(chunks).toHaveLength(5);
        expect(error).toBeInstanceOf(APITimeoutError);
        expect((error as Error).message).toBe("No part of the stream arrived within 60 ms.");
    });

    it("aborts the request when a loop breaks out, and cancels the body", async () => {
        const body = live();
        const {stream, sent} = await open(body.response);
        body.send(`data: ${chunk(1)}\n\ndata: ${chunk(2)}\n\n`);
        for await (const item of stream) {
            expect(item).toEqual(JSON.parse(chunk(1)));
            break;
        }
        expect(sent?.signal?.aborted).toBe(true);
        await pause(0);
        expect(body.cancelled()).toBe(true);
    });

    it("aborts the request on close(), and a loop reading it ends quietly", async () => {
        const body = live();
        const {stream, sent} = await open(body.response);
        body.send(`data: ${chunk(1)}\n\n`);
        const reading = collect(stream);
        await pause(10);
        stream.close();
        expect(await reading).toEqual({chunks: [JSON.parse(chunk(1))], error: null});
        expect(sent?.signal?.aborted).toBe(true);
    });

    it("rejects with the caller's reason when their signal aborts mid-stream", async () => {
        const body = live();
        const controller = new AbortController();
        const {stream} = await open(body.response, {signal: controller.signal});
        body.send(`data: ${chunk(1)}\n\n`);
        const reading = collect(stream);
        await pause(10);
        const reason = new Error("The caller gave up.");
        controller.abort(reason);
        expect(await reading).toEqual({chunks: [JSON.parse(chunk(1))], error: reason});
    });

    it("keeps the caller's signal wired only while the stream is open", async () => {
        const controller = new AbortController();
        const {stream} = await open(sse([chunk(1), "[DONE]"]), {signal: controller.signal});
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
        await collect(stream);
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });

    it("doesn't leave a listener on the attempt's signal for each piece read", async () => {
        const body = live();
        const {stream, sent} = await open(body.response);
        const signal = requireSignal(sent);
        const reading = collect(stream);
        for (let n = 1; n <= 3; n++) {
            body.send(`data: ${chunk(n)}\n\n`);
            await pause(10);
        }
        // Waiting on the next piece holds one listener, never one per piece already read.
        expect(getEventListeners(signal, "abort").length).toBeLessThanOrEqual(1);
        body.send("data: [DONE]\n\n");
        body.end();
        await reading;
        expect(getEventListeners(signal, "abort")).toHaveLength(0);
    });

    it("can be read once", async () => {
        const {stream} = await open(sse([chunk(1), "[DONE]"]));
        await collect(stream);
        const {error} = await collect(stream);
        expect(error).toBeInstanceOf(NeuronAIError);
        expect((error as Error).message).toBe("This stream has already been read: a stream can be read once.");
    });

    it("toReadableStream() gives each chunk as a line of JSON", async () => {
        const {stream} = await open(sse([chunk(1), chunk(2), "[DONE]"]));
        const text = await new Response(stream.toReadableStream()).text();
        expect(text).toBe(`${chunk(1)}\n${chunk(2)}\n`);
    });

    it("cancelling toReadableStream() while a pull is waiting on the network aborts the request at once", async () => {
        const body = live();
        const controller = new AbortController();
        const {stream, sent} = await open(body.response, {signal: controller.signal});
        body.send(`data: ${chunk(1)}\n\n`);
        const reader = stream.toReadableStream().getReader();
        await reader.read();
        // Lets the next pull start and reach its own pending read on the network, so cancelling below finds a pending next() to queue behind.
        await pause(0);
        const cancelling = reader.cancel();
        await pause(10);
        expect(sent?.signal?.aborted).toBe(true);
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
        await cancelling;
    });

    it("cancelling toReadableStream() before its first pull still aborts the request", async () => {
        const body = live();
        const controller = new AbortController();
        const {stream, sent} = await open(body.response, {signal: controller.signal});
        const reader = stream.toReadableStream().getReader();
        const cancelling = reader.cancel();
        await pause(10);
        expect(sent?.signal?.aborted).toBe(true);
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
        await cancelling;
    });

    it("raises APIError for a success answer that isn't an event stream", async () => {
        const {fetch} = mockFetch(json(200, {id: "chatcmpl-1"}));
        const {http} = httpClient(fetch);
        const error = await http.request({method: "POST", path: "/chat/completions", body: {stream: true}, retry: "paid"}, readStream<Chunk>).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APIError);
        expect(error).toMatchObject({status: 200, code: null});
    });
});
