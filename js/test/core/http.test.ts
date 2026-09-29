import {inspect} from "node:util";
import {describe, expect, it} from "vitest";
import type {APIRequest} from "../../src/core/http";
import {readEnvelope} from "../../src/core/parse";
import type {RetryClass} from "../../src/core/retry";
import {APIConnectionError, APIError, APITimeoutError, ConflictError, InternalServerError, NeuronAIError, NotFoundError, RateLimitError} from "../../src/errors";
import {httpClient, KEY} from "../helpers/http";
import {apiError, envelope, hang, json, mockFetch, refused, reset, stalledBody, type Reply} from "../helpers/mock-fetch";

const balance: APIRequest = {method: "GET", path: "/balance", retry: "safe"};
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("a request", () => {
    it("sends the bearer key, a JSON Accept and the User-Agent", async () => {
        const {fetch, requests} = mockFetch(envelope({balance: 1}));
        const {http} = httpClient(fetch);
        await http.request(balance, readEnvelope);
        const [sent] = requests;
        expect(sent?.url.href).toBe("https://my.neuronai.uz/api/v1/balance");
        expect(sent?.method).toBe("GET");
        expect(sent?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
        expect(sent?.headers.get("accept")).toBe("application/json");
        expect(sent?.headers.get("user-agent")).toBe("naiuz-js/test (Node 20.19)");
    });

    it("sends a body as JSON with its content type, and no content type without a body", async () => {
        const {fetch, requests} = mockFetch(envelope({id: "k1"}), new Response(null, {status: 204}));
        const {http} = httpClient(fetch);
        await http.request({method: "PATCH", path: "/api-keys/{id}", pathParams: {id: "k1"}, body: {enabled: false, description: null}, retry: "safe"}, readEnvelope);
        await http.request({method: "POST", path: "/api-keys/{id}/revoke", pathParams: {id: "k1"}, retry: "safe"}, () => Promise.resolve(undefined));
        expect(requests[0]?.body).toBe('{"enabled":false,"description":null}');
        expect(requests[0]?.headers.get("content-type")).toBe("application/json");
        expect(requests[1]?.body).toBeNull();
        expect(requests[1]?.headers.has("content-type")).toBe(false);
    });

    it("adds the client's default headers, then the call's extra headers over them", async () => {
        const {fetch, requests} = mockFetch(envelope({}));
        const {http} = httpClient(fetch, {defaultHeaders: {"x-app": "shop", "x-trace": "default"}});
        await http.request({...balance, options: {extraHeaders: {"x-trace": "call"}}}, readEnvelope);
        expect(requests[0]?.headers.get("x-app")).toBe("shop");
        expect(requests[0]?.headers.get("x-trace")).toBe("call");
    });

    it("refuses a header HTTP can't carry, naming the header but never its value", async () => {
        const {fetch, requests} = mockFetch();
        const {http} = httpClient(fetch);
        const error = await http.request({...balance, options: {extraHeaders: {"x-token": "secret\nvalue"}}}, readEnvelope).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(NeuronAIError);
        expect((error as Error).message).toBe('The header "x-token" has a name or value that HTTP can\'t carry.');
        expect(requests).toHaveLength(0);
    });

    it("gives the parsed result with the status and headers through withResponse()", async () => {
        const {fetch} = mockFetch(envelope({id: "job-1"}, "req-7", 202));
        const {http} = httpClient(fetch);
        const {data, status, headers} = await http.request<{id: string}>({method: "POST", path: "/tts/jobs", body: {text: "Salom"}, retry: "idempotent"}, readEnvelope).withResponse();
        expect(data.id).toBe("job-1");
        expect(status).toBe(202);
        expect(headers.get("x-request-id")).toBe("req-7");
    });

    it("raises an error answer as its class, with the envelope's details", async () => {
        const {fetch} = mockFetch(apiError(404, "not_found"));
        const {http} = httpClient(fetch);
        const error = await http.request(balance, readEnvelope).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error).toMatchObject({status: 404, code: "not_found", message: "The not_found message.", request_id: "req-error"});
    });

    it("raises APIError for a success answer that isn't JSON, without retrying it", async () => {
        const {fetch, requests} = mockFetch(new Response("<html>login</html>", {status: 200, headers: {"content-type": "text/html"}}));
        const {http} = httpClient(fetch);
        await expect(http.request(balance, readEnvelope)).rejects.toBeInstanceOf(APIError);
        expect(requests).toHaveLength(1);
    });
});

describe("retries", () => {
    it("retries a 503 twice, waiting 0.5 s then 1 s, then raises the last error", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable"), apiError(503, "service_unavailable"), apiError(503, "service_unavailable"));
        const {http, sleeps} = httpClient(fetch);
        await expect(http.request(balance, readEnvelope)).rejects.toBeInstanceOf(InternalServerError);
        expect(requests).toHaveLength(3);
        expect(sleeps).toEqual([500, 1000]);
    });

    it("stops as soon as an attempt succeeds", async () => {
        const {fetch, requests} = mockFetch(apiError(502, "upstream_error"), envelope({balance: 5}));
        const {http, sleeps} = httpClient(fetch);
        await expect(http.request(balance, readEnvelope)).resolves.toEqual({balance: 5});
        expect(requests).toHaveLength(2);
        expect(sleeps).toEqual([500]);
    });

    it("adds up to 25% jitter to the wait", async () => {
        const {fetch} = mockFetch(apiError(503, "service_unavailable"), envelope({}));
        const {http, sleeps} = httpClient(fetch, {random: () => 0.5});
        await http.request(balance, readEnvelope);
        expect(sleeps).toEqual([562.5]);
    });

    it("never retries an error status other than 429 and 5xx", async () => {
        const {fetch, requests} = mockFetch(apiError(409, "conflict"));
        const {http} = httpClient(fetch);
        await expect(http.request(balance, readEnvelope)).rejects.toBeInstanceOf(ConflictError);
        expect(requests).toHaveLength(1);
    });

    it("makes one attempt with maxRetries 0, a call's value winning over the client's", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable"));
        const {http} = httpClient(fetch, {maxRetries: 2});
        await expect(http.request({...balance, options: {maxRetries: 0}}, readEnvelope)).rejects.toBeInstanceOf(InternalServerError);
        expect(requests).toHaveLength(1);
    });

    it("refuses an invalid per-call maxRetries or timeout without sending", async () => {
        const {fetch, requests} = mockFetch();
        const {http} = httpClient(fetch);
        await expect(http.request({...balance, options: {maxRetries: -1}}, readEnvelope)).rejects.toThrow("maxRetries must be a whole number, 0 or more.");
        await expect(http.request({...balance, options: {timeout: 0}}, readEnvelope)).rejects.toThrow("timeout must be a number of milliseconds from 1 to 2147483647.");
        expect(requests).toHaveLength(0);
    });

    it("waits what Retry-After says instead of the computed wait", async () => {
        const {fetch} = mockFetch(apiError(429, "rate_limit_exceeded", {"retry-after": "3"}), envelope({}));
        const {http, sleeps} = httpClient(fetch);
        await http.request(balance, readEnvelope);
        expect(sleeps).toEqual([3000]);
    });

    it("reads a Retry-After date as the seconds from now", async () => {
        const {fetch} = mockFetch(apiError(503, "service_unavailable", {"retry-after": "Tue, 29 Sep 2026 10:00:05 GMT"}), envelope({}));
        const {http, sleeps} = httpClient(fetch);
        await http.request(balance, readEnvelope);
        expect(sleeps).toEqual([5000]);
    });

    it("raises at once rather than wait a Retry-After of more than a minute", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable", {"retry-after": "1800"}));
        const {http, sleeps} = httpClient(fetch);
        await expect(http.request(balance, readEnvelope)).rejects.toBeInstanceOf(InternalServerError);
        expect(requests).toHaveLength(1);
        expect(sleeps).toEqual([]);
    });

    it("waits the computed backoff when a 429 has no Retry-After, and reports retry_after as null", async () => {
        const {fetch} = mockFetch(apiError(429, "concurrency_limit_exceeded"), apiError(429, "concurrency_limit_exceeded"));
        const {http, sleeps} = httpClient(fetch, {maxRetries: 1});
        const error = await http.request(balance, readEnvelope).catch((caught: unknown) => caught);
        expect(sleeps).toEqual([500]);
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retry_after).toBeNull();
    });

    it.each<[RetryClass, string, () => Reply, number]>([
        ["safe", "a reset after sending", reset, 2],
        ["idempotent", "a reset after sending", reset, 2],
        ["paid", "a reset after sending", reset, 1],
        ["recreate", "a reset after sending", reset, 1],
        ["once", "a reset after sending", reset, 1],
        ["once", "a refused connection", refused, 2],
        ["paid", "a refused connection", refused, 2],
        ["once", "a 503", () => apiError(503, "service_unavailable"), 1],
        ["paid", "a 503", () => apiError(503, "service_unavailable"), 2],
        ["recreate", "a 503", () => apiError(503, "service_unavailable"), 2],
        ["safe", "a 501", () => apiError(501, "server_error"), 1],
        ["idempotent", "a 501", () => apiError(501, "server_error"), 2],
        ["once", "a 429", () => apiError(429, "rate_limit_exceeded"), 2],
    ])("a %s call facing %s makes %i request(s)", async (retry, _label, failure, expected) => {
        const {fetch, requests} = mockFetch(failure(), envelope({}));
        const {http} = httpClient(fetch, {maxRetries: 1});
        await http.request({...balance, retry}, readEnvelope).catch(() => undefined);
        expect(requests).toHaveLength(expected);
    });
});

describe("timeouts", () => {
    it("raises APITimeoutError when an attempt outlives its timeout", async () => {
        const {fetch} = mockFetch(hang);
        const {http} = httpClient(fetch, {timeout: 20, maxRetries: 0});
        const error = await http.request(balance, readEnvelope).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APITimeoutError);
        expect((error as Error).message).toBe("Request timed out after 20 ms.");
    });

    it("times out a body that stalls after the headers arrive", async () => {
        const {fetch} = mockFetch(stalledBody);
        const {http} = httpClient(fetch, {timeout: 20, maxRetries: 0});
        await expect(http.request(balance, readEnvelope)).rejects.toBeInstanceOf(APITimeoutError);
    });

    it("uses a call's timeout over the client's", async () => {
        const {fetch} = mockFetch(hang);
        const {http} = httpClient(fetch, {timeout: 60_000, maxRetries: 0});
        await expect(http.request({...balance, options: {timeout: 20}}, readEnvelope)).rejects.toBeInstanceOf(APITimeoutError);
    });

    it("retries a timeout on a safe call, but not on a paid one", async () => {
        const safe = mockFetch(hang, envelope({ok: true}));
        await expect(httpClient(safe.fetch, {timeout: 20}).http.request(balance, readEnvelope)).resolves.toEqual({ok: true});
        expect(safe.requests).toHaveLength(2);
        const paid = mockFetch(hang, envelope({ok: true}));
        await expect(httpClient(paid.fetch, {timeout: 20}).http.request({...balance, retry: "paid"}, readEnvelope)).rejects.toBeInstanceOf(APITimeoutError);
        expect(paid.requests).toHaveLength(1);
    });
});

describe("connection errors", () => {
    it("raise APIConnectionError, saying what failed and keeping the cause", async () => {
        const failure = refused();
        const {fetch} = mockFetch(failure);
        const {http} = httpClient(fetch, {maxRetries: 0});
        const error = await http.request(balance, readEnvelope).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APIConnectionError);
        expect(error).not.toBeInstanceOf(APITimeoutError);
        expect((error as Error).message).toBe("Connection error: connect ECONNREFUSED 127.0.0.1:443");
        expect((error as Error).cause).toBe(failure);
    });
});

describe("idempotency keys", () => {
    const createJob: APIRequest = {method: "POST", path: "/tts/jobs", body: {text: "Salom"}, retry: "idempotent"};

    it("sends the caller's key, the same on every retry", async () => {
        const {fetch, requests} = mockFetch(apiError(500, "server_error"), reset(), envelope({id: "job-1"}));
        const {http} = httpClient(fetch);
        await http.request({...createJob, options: {idempotencyKey: "order-42"}}, readEnvelope);
        expect(requests.map((request) => request.headers.get("idempotency-key"))).toEqual(["order-42", "order-42", "order-42"]);
    });

    it("generates a UUIDv4 when the caller gives none, and reuses it on every retry", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable"), envelope({id: "job-1"}));
        const {http} = httpClient(fetch);
        await http.request(createJob, readEnvelope);
        const [first, second] = requests.map((request) => request.headers.get("idempotency-key"));
        expect(first).toMatch(UUID_V4);
        expect(second).toBe(first);
    });

    it("gives each call its own generated key", async () => {
        const {fetch, requests} = mockFetch(envelope({id: "job-1"}), envelope({id: "job-2"}));
        const {http} = httpClient(fetch);
        await http.request(createJob, readEnvelope);
        await http.request(createJob, readEnvelope);
        expect(requests[0]?.headers.get("idempotency-key")).not.toBe(requests[1]?.headers.get("idempotency-key"));
    });

    it("sends none on calls of other classes", async () => {
        const {fetch, requests} = mockFetch(envelope({}), envelope({}));
        const {http} = httpClient(fetch);
        await http.request({...createJob, retry: "paid", options: {idempotencyKey: "ignored"}}, readEnvelope);
        await http.request(balance, readEnvelope);
        expect(requests.every((request) => !request.headers.has("idempotency-key"))).toBe(true);
    });
});

describe("a caller's AbortSignal", () => {
    it("aborts the request in flight and rejects with the signal's reason, without retrying", async () => {
        const {fetch, requests} = mockFetch(hang, envelope({}));
        const {http} = httpClient(fetch);
        const controller = new AbortController();
        const reason = new Error("The caller gave up.");
        const call = http.request({...balance, options: {signal: controller.signal}}, readEnvelope);
        setTimeout(() => {
            controller.abort(reason);
        }, 10);
        await expect(call).rejects.toBe(reason);
        expect(requests).toHaveLength(1);
    });

    it("cuts the wait between attempts short", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable", {"retry-after": "30"}), envelope({}));
        const {http} = httpClient(fetch, {sleep: undefined});
        const controller = new AbortController();
        const reason = new Error("The caller gave up.");
        const started = Date.now();
        const call = http.request({...balance, options: {signal: controller.signal}}, readEnvelope);
        setTimeout(() => {
            controller.abort(reason);
        }, 20);
        await expect(call).rejects.toBe(reason);
        expect(requests).toHaveLength(1);
        expect(Date.now() - started).toBeLessThan(5000);
    });

    it("sends nothing when the signal has already aborted", async () => {
        const {fetch, requests} = mockFetch();
        const {http} = httpClient(fetch);
        const reason = new Error("Already cancelled.");
        await expect(http.request({...balance, options: {signal: AbortSignal.abort(reason)}}, readEnvelope)).rejects.toBe(reason);
        expect(requests).toHaveLength(0);
    });
});

describe("the API key", () => {
    it("never appears in an error, however it is printed", async () => {
        const errors: unknown[] = [];
        for (const reply of [refused(), hang, apiError(401, "invalid_api_key"), json(200, [])]) {
            const {fetch} = mockFetch(reply);
            const {http} = httpClient(fetch, {timeout: 20, maxRetries: 0});
            errors.push(await http.request(balance, readEnvelope).catch((caught: unknown) => caught));
        }
        for (const error of errors) {
            expect(error).toBeInstanceOf(NeuronAIError);
            expect(inspect(error, {depth: Infinity, showHidden: true})).not.toContain(KEY);
            expect(JSON.stringify(error)).not.toContain(KEY);
            expect(String(error)).not.toContain(KEY);
        }
    });
});
