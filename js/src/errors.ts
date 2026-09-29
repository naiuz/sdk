import {isRecord} from "./core/json";
import {parseRetryAfter} from "./core/retry-after";
import type {ErrorType} from "./types/errors";

/** The base of every error this SDK throws. */
export class NeuronAIError extends Error {
    override name = "NeuronAIError";
}

/** The API could not be reached, or the connection failed before a whole answer arrived: DNS, TLS, or a refused, reset or dropped connection. */
export class APIConnectionError extends NeuronAIError {
    override name = "APIConnectionError";

    constructor(message = "Connection error.", options?: ErrorOptions) {
        super(message, options);
    }
}

/** An attempt took longer than its timeout, reading the response body included. */
export class APITimeoutError extends APIConnectionError {
    override name = "APITimeoutError";

    constructor(message = "Request timed out.", options?: ErrorOptions) {
        super(message, options);
    }
}

/** What every `APIError` carries. */
export interface APIErrorInit {
    status: number;
    message: string;
    type: ErrorType | null;
    code: string | null;
    param: string | null;
    fields: Record<string, string> | null;
    request_id: string | null;
    headers: Headers;
}

/**
 * The API answered with an error. A status with its own class raises that
 * class; any other status raises APIError itself.
 */
export class APIError extends NeuronAIError {
    override name = "APIError";
    /** The HTTP status. */
    readonly status: number;
    /** `invalid_request_error`, `insufficient_quota`, `rate_limit_error` or `server_error`; `null` when the answer was not the API's error envelope. */
    readonly type: ErrorType | null;
    /** A stable, machine-readable code, such as `insufficient_balance` (see `ErrorCode`). Match on it, never on `message`. `null` outside the envelope. */
    readonly code: string | null;
    /** The first invalid parameter, or `null`. */
    readonly param: string | null;
    /** Validation errors only: each invalid field and its first message. `null` otherwise. */
    readonly fields: Record<string, string> | null;
    /** The request's ID, to quote to support: the envelope's `request_id`, else the `X-Request-Id` header, else `null`. */
    readonly request_id: string | null;
    /** The answer's headers. */
    readonly headers: Headers;

    constructor(init: APIErrorInit) {
        super(init.message);
        this.status = init.status;
        this.type = init.type;
        this.code = init.code;
        this.param = init.param;
        this.fields = init.fields;
        this.request_id = init.request_id;
        this.headers = init.headers;
    }
}

/** 400: the request is malformed. */
export class BadRequestError extends APIError {
    override name = "BadRequestError";
}

/** 401: the API key is missing, unknown, disabled, revoked or expired. */
export class AuthenticationError extends APIError {
    override name = "AuthenticationError";
}

/** 402: the balance is too low, or the key's monthly spend limit would be passed. */
export class InsufficientQuotaError extends APIError {
    override name = "InsufficientQuotaError";
}

/** 403: the key may not do this, from this address, or with this voice. */
export class PermissionDeniedError extends APIError {
    override name = "PermissionDeniedError";
}

/** 404: no such route or resource in this organization. */
export class NotFoundError extends APIError {
    override name = "NotFoundError";
}

/** 409: the request conflicts with the resource's state, or reuses an Idempotency-Key with a different body. */
export class ConflictError extends APIError {
    override name = "ConflictError";
}

/** 410: the resource is gone, such as a job's audio past its retention window. */
export class GoneError extends APIError {
    override name = "GoneError";
}

/** 413: the request is larger than the server accepts. */
export class PayloadTooLargeError extends APIError {
    override name = "PayloadTooLargeError";
}

/** 415: the uploaded media type is not supported. */
export class UnsupportedMediaTypeError extends APIError {
    override name = "UnsupportedMediaTypeError";
}

/** 422: the request failed validation. `fields` maps each invalid field to its first message. */
export class UnprocessableEntityError extends APIError {
    override name = "UnprocessableEntityError";
}

/** 429: too many requests. */
export class RateLimitError extends APIError {
    override name = "RateLimitError";
    /** The seconds the `Retry-After` header asks for (an HTTP date counts from now), or `null` when the answer has none. */
    readonly retry_after: number | null;

    constructor(init: APIErrorInit & {retry_after: number | null}) {
        super(init);
        this.retry_after = init.retry_after;
    }
}

/** A status of 500 or above: the server failed. */
export class InternalServerError extends APIError {
    override name = "InternalServerError";
}

const CLASS_BY_STATUS: Partial<Record<number, new (init: APIErrorInit) => APIError>> = {
    400: BadRequestError,
    401: AuthenticationError,
    402: InsufficientQuotaError,
    403: PermissionDeniedError,
    404: NotFoundError,
    409: ConflictError,
    410: GoneError,
    413: PayloadTooLargeError,
    415: UnsupportedMediaTypeError,
    422: UnprocessableEntityError,
};

const stringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

function fromEnvelope(status: number, headers: Headers, body: string): APIErrorInit | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    const {error} = parsed;
    if (!isRecord(error) || typeof error.message !== "string") return null;
    const fields = isRecord(error.fields)
        ? Object.fromEntries(Object.entries(error.fields).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : null;
    return {
        status,
        headers,
        message: error.message,
        type: stringOrNull(error.type),
        code: stringOrNull(error.code),
        param: stringOrNull(error.param),
        fields,
        request_id: stringOrNull(parsed.request_id) ?? headers.get("x-request-id"),
    };
}

function outsideEnvelope(status: number, statusText: string, headers: Headers, body: string): APIErrorInit {
    // HTTP/2 has no status text, so fall back to the number.
    const head = statusText.trim() || `HTTP ${String(status)}`;
    const snippet = body.slice(0, 200).trim();
    return {
        status,
        headers,
        message: snippet === "" ? head : `${head}: ${snippet}`,
        type: null,
        code: null,
        param: null,
        fields: null,
        request_id: headers.get("x-request-id"),
    };
}

/**
 * The error for an answer the SDK can't use: an error status, or a success
 * whose body isn't what the operation returns. The API's envelope fills in
 * `type`, `code`, `message`, `param` and `fields`. Anything else (a proxy's
 * HTML page, say) leaves `type` and `code` null, and the message is the
 * status text, then the first 200 characters of the body, trimmed.
 */
export function makeAPIError(status: number, statusText: string, headers: Headers, body: string, now: number = Date.now()): APIError {
    const init = fromEnvelope(status, headers, body) ?? outsideEnvelope(status, statusText, headers, body);
    if (status === 429) return new RateLimitError({...init, retry_after: parseRetryAfter(headers.get("retry-after"), now)});
    if (status >= 500) return new InternalServerError(init);
    const ErrorClass = CLASS_BY_STATUS[status] ?? APIError;
    return new ErrorClass(init);
}
