import {APIConnectionError, APITimeoutError, makeAPIError, NeuronAIError} from "../errors";
import {APIPromise, type WithResponse} from "./api-promise";
import {readText} from "./parse";
import {failedBeforeSending, isRetryable, retryDelay, type AttemptFailure, type RetryClass} from "./retry";
import {parseRetryAfter} from "./retry-after";
import {rootMessage} from "./root-message";
import {toFormData} from "./uploads";
import {buildURL, type QueryValue} from "./url";

/** Per-call options: every method takes them as its last argument. */
export interface RequestOptions {
    /** Milliseconds each attempt may take, reading the response included. Overrides the client's `timeout`. */
    timeout?: number;
    /** How many times a failed attempt may be retried. Overrides the client's `maxRetries`. */
    maxRetries?: number;
    /** Headers for this call. They go on last, so they win over the SDK's own headers, the client's `defaultHeaders` and the Idempotency-Key. */
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
    /** The Accept header: `application/json` unless the call answers with something else, such as audio. */
    accept?: string;
    /** Sent as JSON when defined. */
    body?: unknown;
    /**
     * Sent as multipart/form-data when defined, in place of `body`: `params`
     * holds the call's fields, and `files` names the ones that are files.
     * fetch writes the content type, with its boundary.
     */
    multipart?: {params: unknown; files: readonly string[]};
    /** Which failures are retried, and whether an Idempotency-Key is sent (`idempotent`). */
    retry: RetryClass;
    options?: IdempotentRequestOptions | undefined;
}

/**
 * The attempt a reader runs in. A reader that goes on reading after it
 * returns, as a stream does, takes the attempt over: it disarms the timer,
 * adopts the cleanup, and aborts the request once it is done.
 */
export interface Attempt {
    /** Aborts when the attempt times out, when the caller's signal aborts (with the caller's reason), or on `abort()`. */
    readonly signal: AbortSignal;
    /** The call's timeout, in milliseconds. */
    readonly timeout: number;
    /** Aborts the request: its body stops, and the connection is let go. */
    abort(reason?: unknown): void;
    /** Stops the attempt's timer, so the answer can be read for longer than the timeout. */
    disarm(): void;
    /**
     * Keeps the caller's signal wired to `signal` after the reader returns,
     * and hands back the cleanup that unwires it: the reader calls it once it
     * is done with the answer.
     */
    adopt(): () => void;
    /** The text with every occurrence of the API key replaced by `[redacted]`, for a body that goes into an error. */
    redact(text: string): string;
}

/**
 * Reads a successful answer into the call's result. It runs inside the
 * attempt, so the timeout covers it, and it raises what the call should
 * raise for a body it can't use.
 */
export type ParseResponse<T> = (response: Response, attempt: Attempt) => Promise<T>;

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

/** A duration option, checked: a whole or fractional number of milliseconds from 1 to 2147483647. */
export function checkMilliseconds(name: string, value: number): number {
    if (!Number.isFinite(value) || value < 1 || value > MAX_TIMEOUT) {
        throw new NeuronAIError(`${name} must be a number of milliseconds from 1 to ${String(MAX_TIMEOUT)}.`);
    }
    return value;
}

/** A timeout option, checked: a whole or fractional number of milliseconds from 1 to 2147483647. */
export function checkTimeout(value: number): number {
    return checkMilliseconds("timeout", value);
}

/** A maxRetries option, checked: a whole number, 0 or more. */
export function checkMaxRetries(value: number): number {
    if (!Number.isInteger(value) || value < 0) throw new NeuronAIError("maxRetries must be a whole number, 0 or more.");
    return value;
}

/** Resolves after `ms`, or as soon as the signal aborts: whoever waits checks the signal next. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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

/** The promise, unless the signal aborts first: then a rejection at once, so a stalled fetch or body can't outlive its attempt. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
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

type Outcome<T> = {ok: true; result: WithResponse<T>} | {ok: false; error: NeuronAIError; failure: AttemptFailure; retryAfter: number | null};

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
        // Built once, so every retry sends the same Idempotency-Key and the same form.
        const init: RequestInit = {method: request.method, headers: this.#headers(request)};
        if (request.multipart !== undefined) init.body = toFormData(request.multipart.params, request.multipart.files);
        else if (request.body !== undefined) init.body = JSON.stringify(request.body);
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
        // Each group goes over the ones before it: the SDK's own headers, the client's
        // defaultHeaders, the call's Idempotency-Key, then the call's extraHeaders.
        set("authorization", `Bearer ${this.#apiKey}`);
        set("accept", request.accept ?? "application/json");
        set("user-agent", this.#userAgent);
        if (request.body !== undefined && request.multipart === undefined) set("content-type", "application/json");
        for (const [name, value] of Object.entries(this.#defaultHeaders)) set(name, value);
        // After defaultHeaders, so a client-wide Idempotency-Key can't give every call the same key.
        if (request.retry === "idempotent") set("idempotency-key", request.options?.idempotencyKey || crypto.randomUUID());
        for (const [name, value] of Object.entries(request.options?.extraHeaders ?? {})) set(name, value);
        return headers;
    }

    /** Removes every occurrence of the API key from an error answer's body, so a page that echoes the request back (a proxy's or gateway's own error page) can't put it in `APIError.message`. */
    #redact(text: string): string {
        return this.#apiKey === "" ? text : text.split(this.#apiKey).join("[redacted]");
    }

    async #attempt<T>(url: string, init: RequestInit, timeout: number, signal: AbortSignal | undefined, parse: ParseResponse<T>): Promise<Outcome<T>> {
        signal?.throwIfAborted();
        // Aborted by the timer, by the caller's signal (with its reason) or by the reader, whichever comes first.
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
        }, timeout);
        const onAbort = (): void => {
            controller.abort(signal?.reason);
        };
        signal?.addEventListener("abort", onAbort, {once: true});
        const cleanup = (): void => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        };
        // Whether the reader took the attempt over, and so runs the cleanup itself.
        const reader = {adopted: false};
        const attempt: Attempt = {
            signal: controller.signal,
            timeout,
            abort: (reason) => {
                controller.abort(reason);
            },
            disarm: () => {
                clearTimeout(timer);
            },
            adopt: () => {
                reader.adopted = true;
                return cleanup;
            },
            redact: (text) => this.#redact(text),
        };
        let handedOver = false;
        try {
            // Raced against the signal too, so a fetch that ignores init.signal can't outlive its attempt.
            const response = await untilAborted(this.#fetchOnce(url, {...init, signal: controller.signal}), controller.signal);
            if (response.ok) {
                const data = await untilAborted(parse(response, attempt), controller.signal);
                handedOver = reader.adopted;
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
            // A reader that took the attempt over cleans up itself, once it is done with the answer.
            if (!handedOver) cleanup();
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
