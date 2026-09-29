import {describe, expect, it} from "vitest";
import {
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    ConflictError,
    GoneError,
    InsufficientQuotaError,
    InternalServerError,
    makeAPIError,
    NeuronAIError,
    NotFoundError,
    PayloadTooLargeError,
    PermissionDeniedError,
    RateLimitError,
    UnprocessableEntityError,
    UnsupportedMediaTypeError,
} from "../src/errors";

const NOW = Date.UTC(2026, 8, 29, 10, 0, 0);

function envelope(code: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({error: {type: "invalid_request_error", code, message: "Something went wrong.", param: null, ...extra}, request_id: "req-1"});
}

describe("the error hierarchy", () => {
    it("roots every error in NeuronAIError, with APITimeoutError under APIConnectionError", () => {
        const timeout = new APITimeoutError();
        expect(timeout).toBeInstanceOf(APIConnectionError);
        expect(timeout).toBeInstanceOf(NeuronAIError);
        expect(timeout).toBeInstanceOf(Error);
        expect(timeout.name).toBe("APITimeoutError");
        expect(makeAPIError(404, "Not Found", new Headers(), envelope("not_found"))).toBeInstanceOf(NeuronAIError);
    });

    it.each([
        [400, BadRequestError],
        [401, AuthenticationError],
        [402, InsufficientQuotaError],
        [403, PermissionDeniedError],
        [404, NotFoundError],
        [409, ConflictError],
        [410, GoneError],
        [413, PayloadTooLargeError],
        [415, UnsupportedMediaTypeError],
        [422, UnprocessableEntityError],
        [429, RateLimitError],
        [500, InternalServerError],
        [502, InternalServerError],
        [503, InternalServerError],
        [599, InternalServerError],
    ])("raises a %i as its own class", (status, ErrorClass) => {
        const error = makeAPIError(status, "", new Headers(), envelope("server_error"));
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error).toBeInstanceOf(APIError);
        expect(error.name).toBe(ErrorClass.name);
        expect(error.status).toBe(status);
    });

    it("raises any other status as APIError itself", () => {
        for (const status of [200, 405, 418, 451]) {
            const error = makeAPIError(status, "", new Headers(), envelope("method_not_allowed"));
            expect(error.constructor).toBe(APIError);
            expect(error.name).toBe("APIError");
        }
    });
});

describe("an error in the API's envelope", () => {
    it("carries the envelope's type, code, message, param and request_id, and the headers", () => {
        const headers = new Headers({"x-request-id": "req-1"});
        const body = JSON.stringify({
            error: {type: "invalid_request_error", code: "invalid_request", message: "The text field is required.", param: "text", fields: {text: "The text field is required."}},
            request_id: "req-1",
        });
        const error = makeAPIError(422, "Unprocessable Content", headers, body);
        expect(error).toBeInstanceOf(UnprocessableEntityError);
        expect({type: error.type, code: error.code, message: error.message, param: error.param, fields: error.fields, request_id: error.request_id}).toEqual({
            type: "invalid_request_error",
            code: "invalid_request",
            message: "The text field is required.",
            param: "text",
            fields: {text: "The text field is required."},
            request_id: "req-1",
        });
        expect(error.headers).toBe(headers);
    });

    it("keeps a code the SDK doesn't know as a plain string", () => {
        expect(makeAPIError(400, "", new Headers(), envelope("brand_new_code")).code).toBe("brand_new_code");
    });

    it("has null fields unless the envelope sends them", () => {
        expect(makeAPIError(404, "", new Headers(), envelope("not_found")).fields).toBeNull();
    });

    it("takes the request ID from X-Request-Id when the envelope lacks one", () => {
        const body = JSON.stringify({error: {type: "invalid_request_error", code: "not_found", message: "Voice not found.", param: null}});
        expect(makeAPIError(404, "", new Headers({"x-request-id": "req-header"}), body).request_id).toBe("req-header");
    });
});

describe("an error outside the envelope", () => {
    it("still raises the status's class, with null code and type, and the status text plus the start of the body", () => {
        const html = `<html><head><title>502 Bad Gateway</title></head><body>${"x".repeat(300)}</body></html>`;
        const error = makeAPIError(502, "Bad Gateway", new Headers({"x-request-id": "req-proxy"}), html);
        expect(error).toBeInstanceOf(InternalServerError);
        expect(error.code).toBeNull();
        expect(error.type).toBeNull();
        expect(error.param).toBeNull();
        expect(error.fields).toBeNull();
        expect(error.message).toBe(`Bad Gateway: ${html.slice(0, 200)}`);
        expect(error.request_id).toBe("req-proxy");
    });

    it("says what happened even with an empty body and no status text, as over HTTP/2", () => {
        const error = makeAPIError(503, "", new Headers(), "");
        expect(error).toBeInstanceOf(InternalServerError);
        expect(error.message).toBe("HTTP 503");
        expect(error.request_id).toBeNull();
    });

    it("treats JSON that isn't the envelope like any other body", () => {
        const error = makeAPIError(500, "Internal Server Error", new Headers(), '{"message":"Server Error"}');
        expect(error.code).toBeNull();
        expect(error.message).toBe('Internal Server Error: {"message":"Server Error"}');
    });
});

describe("retry_after", () => {
    it("is the Retry-After seconds on a 429", () => {
        const error = makeAPIError(429, "Too Many Requests", new Headers({"retry-after": "12"}), envelope("rate_limit_exceeded"), NOW);
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retry_after).toBe(12);
    });

    it("counts an HTTP-date Retry-After from now", () => {
        const error = makeAPIError(429, "", new Headers({"retry-after": "Tue, 29 Sep 2026 10:00:05 GMT"}), envelope("rate_limit_exceeded"), NOW);
        expect((error as RateLimitError).retry_after).toBe(5);
    });

    it("is null on a 429 without Retry-After", () => {
        const error = makeAPIError(429, "", new Headers(), envelope("concurrency_limit_exceeded"), NOW);
        expect((error as RateLimitError).retry_after).toBeNull();
    });
});
