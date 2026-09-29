import type {Fetch} from "../../src/core/http";

/** A request the SDK sent, as the mock fetch saw it. */
export interface SentRequest {
    url: URL;
    method: string;
    headers: Headers;
    /** The body as text, or null when there is none. */
    body: string | null;
    signal: AbortSignal | null;
}

/** How the mock answers one request: a Response, an error to reject with, or a function of the request. */
export type Reply = Response | Error | ((request: SentRequest) => Response | Promise<Response>);

/** A fetch that answers the n-th request with the n-th reply, and records every request. */
export function mockFetch(...replies: Reply[]): {fetch: Fetch; requests: SentRequest[]} {
    const requests: SentRequest[] = [];
    const fetch: Fetch = (url, init) => {
        const request: SentRequest = {
            url: new URL(url),
            method: init.method ?? "GET",
            headers: new Headers(init.headers),
            body: typeof init.body === "string" ? init.body : null,
            signal: init.signal ?? null,
        };
        requests.push(request);
        const reply = replies[requests.length - 1];
        if (reply === undefined) return Promise.reject(new Error(`Unexpected request ${String(requests.length)}: ${request.method} ${request.url.href}`));
        if (reply instanceof Error) return Promise.reject(reply);
        return Promise.resolve(typeof reply === "function" ? reply(request) : reply);
    };
    return {fetch, requests};
}

/** A JSON answer. */
export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", ...headers}});
}

/** A `{data, request_id}` answer, with the same ID in X-Request-Id. */
export function envelope(data: unknown, requestId = "req-1", status = 200): Response {
    return json(status, {data, request_id: requestId}, {"x-request-id": requestId});
}

/** An error answer in the API's envelope. */
export function apiError(status: number, code: string, headers: Record<string, string> = {}): Response {
    const type = status === 402 ? "insufficient_quota" : status === 429 ? "rate_limit_error" : status >= 500 ? "server_error" : "invalid_request_error";
    return json(status, {error: {type, code, message: `The ${code} message.`, param: null}, request_id: "req-error"}, {"x-request-id": "req-error", ...headers});
}

/** An answer that never comes: like fetch, it rejects only once the request is aborted. */
export function hang(request: SentRequest): Promise<Response> {
    return new Promise((_resolve, reject) => {
        request.signal?.addEventListener(
            "abort",
            () => {
                reject(new DOMException("This operation was aborted", "AbortError"));
            },
            {once: true},
        );
    });
}

/** Headers at once, then a body that never arrives. */
export function stalledBody(): Response {
    return new Response(new ReadableStream<Uint8Array>(), {status: 200, headers: {"content-type": "application/json"}});
}

/** A fetch failure before anything was sent: the connection was refused. */
export function refused(): TypeError {
    return new TypeError("fetch failed", {cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {code: "ECONNREFUSED"})});
}

/** A fetch failure before anything was sent, from a host with more than one address: every address refused, as Node's fetch reports it (an AggregateError with an empty message). */
export function refusedEverywhere(): TypeError {
    const perAddress = [
        Object.assign(new Error("connect ECONNREFUSED ::1:443"), {code: "ECONNREFUSED"}),
        Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {code: "ECONNREFUSED"}),
    ];
    return new TypeError("fetch failed", {cause: Object.assign(new AggregateError(perAddress, ""), {code: "ECONNREFUSED"})});
}

/** A fetch failure after the request went out: the connection was reset. */
export function reset(): TypeError {
    return new TypeError("fetch failed", {cause: Object.assign(new Error("read ECONNRESET"), {code: "ECONNRESET"})});
}
