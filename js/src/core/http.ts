import {APIConnectionError, APITimeoutError, makeAPIError, NeuronAIError} from "../errors";
import {APIPromise, type WithResponse} from "./api-promise";
import {readText} from "./parse";
import {failedBeforeSending, isRetryable, retryDelay, type AttemptFailure, type RetryClass} from "./retry";
import {parseRetryAfter} from "./retry-after";
import {buildURL, type QueryValue} from "./url";

/** Per-call options: every method takes them as its last argument. */
export interface RequestOptions {
    /** Milliseconds each attempt may take, reading the response included. Overrides the client's `timeout`. */
    timeout?: number;
    /** How many times a failed attempt may be retried. Overrides the client's `maxRetries`. */
    maxRetries?: number;
    /** Headers for this call, sent after the client's `defaultHeaders`, so they win over them. */
    extraHeaders?: Record<string, string>;
    /** Cancels the call: the request is aborted, nothing is retried, and the call rejects with the signal's reason. */
    signal?: AbortSignal;
}

/** The options of a call that sends an Idempotency-Key. */
export interface IdempotentRequestOptions extends RequestOptions {
    /**
     * Sent as the Idempotency-Key header (at most 191 characters). Without
     * it, or with an empty string, the SDK generates a UUIDv4. Every retry of
     * the call sends the same key, so a retry never charges twice.
     */
    idempotencyKey?: string;
}

/** One API call, as a resource hands it to the HTTP core. */
export interface APIRequest {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    /** The path under the base URL, with `{name}` for each path parameter, such as `/tts/voices/{id}`. */
    path: string;
    pathParams?: Record<string, string>;
    /** The query. Undefined and null values are left out. */
    query?: Record<string, QueryValue>;
    /** Sent as JSON when defined. */
    body?: unknown;
    /** Which failures are retried, and whether an Idempotency-Key is sent (`idempotent`). */
    retry: RetryClass;
    options?: IdempotentRequestOptions | undefined;
}

/**
 * Reads a successful answer into the call's result. It runs inside the
 * attempt, so the timeout covers it, and it raises what the call should
 * raise for a body it can't use.
 */
export type ParseResponse<T> = (response: Response) => Promise<T>;

/** A fetch implementation. The SDK calls it with a URL string and a RequestInit. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** What the client hands the HTTP core. */
export interface HttpClientConfig {
    apiKey: string;
    baseURL: string;
    /** Milliseconds per attempt. */
    timeout: number;
    maxRetries: number;
    defaultHeaders: Record<string, string>;
    userAgent: string;
    fetch: Fetch;
    /** Waits between attempts: resolves after `ms`, or as soon as the signal aborts. */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    /** The jitter's random source, in [0, 1). */
    random?: () => number;
    /** The time in milliseconds, for Retry-After dates. */
    now?: () => number;
}

/** The longest timeout setTimeout can wait for, in milliseconds. */
const MAX_TIMEOUT = 2_147_483_647;

/** A timeout option, checked: a whole or fractional number of milliseconds from 1 to 2147483647. */
export function checkTimeout(value: number): number {
    if (!Number.isFinite(value) || value < 1 || value > MAX_TIMEOUT) {
        throw new NeuronAIError(`timeout must be a number of milliseconds from 1 to ${String(MAX_TIMEOUT)}.`);
    }
    return value;
}

/** A maxRetries option, checked: a whole number, 0 or more. */
export function checkMaxRetries(value: number): number {
    if (!Number.isInteger(value) || value < 0) throw new NeuronAIError("maxRetries must be a whole number, 0 or more.");
    return value;
}

/** Resolves after `ms`, or as soon as the signal aborts: the next attempt then rejects with the signal's reason. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = (): void => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        if (signal?.aborted) done();
        else signal?.addEventListener("abort", done, {once: true});
    });
}

/** The promise, unless the signal aborts first: then a rejection at once, so a stalled body can't outlive its attempt. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    let stop = (): void => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
        stop = () => {
            reject(new APIConnectionError("The request was aborted."));
        };
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, {once: true});
    });
    return Promise.race([promise, aborted]).finally(() => {
        signal.removeEventListener("abort", stop);
    });
}

/** How deep `rootMessage` follows a cause chain or an AggregateError's `errors`, so a cause that refers back to itself can't loop forever. */
const MAX_ROOT_MESSAGE_DEPTH = 5;

/**
 * The deepest non-empty message in `error`'s cause chain. Node's fetch, when
 * every address of a host refuses the connection, rejects with a TypeError
 * whose cause is an AggregateError with an empty message; when a link's own
 * message is empty, the first non-empty message among its `errors` is used
 * instead.
 */
function rootMessage(error: unknown, depth = 0): string {
    if (!(error instanceof Error)) return String(error);
    if (depth >= MAX_ROOT_MESSAGE_DEPTH) return error.message;
    const {errors} = error as Error & {errors?: unknown};
    if (error.message === "" && Array.isArray(errors)) {
        for (const inner of errors) {
            const message = rootMessage(inner, depth + 1);
            if (message !== "") return message;
        }
    }
    if (error.cause instanceof Error) {
        const deeper = rootMessage(error.cause, depth + 1);
        if (deeper !== "") return deeper;
    }
    return error.message;
}

type Attempt<T> = {ok: true; result: WithResponse<T>} | {ok: false; error: NeuronAIError; failure: AttemptFailure; retryAfter: number | null};

/**
 * Sends API calls: it builds each request, runs the attempts with their
 * timeout, retries as the call's class allows, and maps error answers to
 * APIError subclasses. Resources hold one and describe their calls to it.
 */
export class HttpClient {
    readonly #apiKey: string;
    readonly #baseURL: string;
    readonly #timeout: number;
    readonly #maxRetries: number;
    readonly #defaultHeaders: Record<string, string>;
    readonly #userAgent: string;
    readonly #fetch: Fetch;
    readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly #random: () => number;
    readonly #now: () => number;

    constructor(config: HttpClientConfig) {
        this.#apiKey = config.apiKey;
        this.#baseURL = config.baseURL;
        this.#timeout = config.timeout;
        this.#maxRetries = config.maxRetries;
        this.#defaultHeaders = config.defaultHeaders;
        this.#userAgent = config.userAgent;
        this.#fetch = config.fetch;
        this.#sleep = config.sleep ?? sleep;
        this.#random = config.random ?? Math.random;
        this.#now = config.now ?? Date.now;
    }

    /** Sends the call and returns its APIPromise. */
    request<T>(request: APIRequest, parse: ParseResponse<T>): APIPromise<T> {
        return new APIPromise(this.send(request, parse));
    }

    /**
     * Sends the call, retrying as its class allows, and resolves to the parsed
     * result with the final answer's status and headers. Waits between
     * attempts as `retryDelay` says.
     */
    async send<T>(request: APIRequest, parse: ParseResponse<T>): Promise<WithResponse<T>> {
        const options = request.options ?? {};
        const timeout = checkTimeout(options.timeout ?? this.#timeout);
        const maxRetries = checkMaxRetries(options.maxRetries ?? this.#maxRetries);
        const url = buildURL(this.#baseURL, request.path, request.pathParams, request.query);
        // Built once, so every retry sends the same Idempotency-Key.
        const init: RequestInit = {method: request.method, headers: this.#headers(request)};
        if (request.body !== undefined) init.body = JSON.stringify(request.body);
        for (let retry = 0; ; retry++) {
            const attempt = await this.#attempt(url, init, timeout, options.signal, parse);
            if (attempt.ok) return attempt.result;
            const delay = retry < maxRetries && isRetryable(request.retry, attempt.failure) ? retryDelay(retry, attempt.retryAfter, this.#random) : null;
            if (delay === null) throw attempt.error;
            await this.#sleep(delay, options.signal);
        }
    }

    #headers(request: APIRequest): Headers {
        const headers = new Headers();
        const set = (name: string, value: string): void => {
            try {
                headers.set(name, value);
            } catch {
                // The Headers error quotes the value, which may be secret, so name the header only.
                throw new NeuronAIError(`The header "${name}" has a name or value that HTTP can't carry.`);
            }
        };
        set("authorization", `Bearer ${this.#apiKey}`);
        set("accept", "application/json");
        set("user-agent", this.#userAgent);
        if (request.body !== undefined) set("content-type", "application/json");
        if (request.retry === "idempotent") set("idempotency-key", request.options?.idempotencyKey || crypto.randomUUID());
        for (const [name, value] of Object.entries(this.#defaultHeaders)) set(name, value);
        for (const [name, value] of Object.entries(request.options?.extraHeaders ?? {})) set(name, value);
        return headers;
    }

    /** Removes every occurrence of the API key from an error answer's body, so a page that echoes the request back (a proxy's or gateway's own error page) can't put it in `APIError.message`. */
    #redact(text: string): string {
        return this.#apiKey === "" ? text : text.split(this.#apiKey).join("[redacted]");
    }

    async #attempt<T>(url: string, init: RequestInit, timeout: number, signal: AbortSignal | undefined, parse: ParseResponse<T>): Promise<Attempt<T>> {
        signal?.throwIfAborted();
        // Aborted by the timer or by the caller's signal, whichever comes first.
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
        }, timeout);
        const onAbort = (): void => {
            controller.abort();
        };
        signal?.addEventListener("abort", onAbort, {once: true});
        try {
            const response = await this.#fetchOnce(url, {...init, signal: controller.signal});
            if (response.ok) {
                const data = await untilAborted(parse(response), controller.signal);
                return {ok: true, result: {data, status: response.status, headers: response.headers}};
            }
            const text = this.#redact(await untilAborted(readText(response), controller.signal));
            const now = this.#now();
            const error = makeAPIError(response.status, response.statusText, response.headers, text, now);
            return {
                ok: false,
                error,
                failure: {kind: "status", status: response.status, enveloped: error.code !== null},
                retryAfter: parseRetryAfter(response.headers.get("retry-after"), now),
            };
        } catch (error) {
            signal?.throwIfAborted();
            if (controller.signal.aborted) {
                return {ok: false, error: new APITimeoutError(`Request timed out after ${String(timeout)} ms.`), failure: {kind: "timeout"}, retryAfter: null};
            }
            if (error instanceof APIConnectionError) {
                return {ok: false, error, failure: {kind: "connection", beforeSend: failedBeforeSending(error.cause)}, retryAfter: null};
            }
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        }
    }

    async #fetchOnce(url: string, init: RequestInit): Promise<Response> {
        // Called as a plain function: a browser's or a worker's fetch refuses any other `this`.
        const fetchImpl = this.#fetch;
        try {
            return await fetchImpl(url, init);
        } catch (cause) {
            throw new APIConnectionError(`Connection error: ${rootMessage(cause)}`, {cause});
        }
    }
}
