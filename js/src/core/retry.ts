/**
 * Which failures a call may retry, as the spec's retry table gives them.
 * Every class retries a 429, and a connection error raised before the
 * request was sent. Beyond that:
 * - `safe`: GET, DELETE, apiKeys.update and apiKeys.revoke. Also 500, 502,
 *   503 and 504, and a timeout or a connection error after sending.
 * - `idempotent`: the five POSTs that send an Idempotency-Key. Also any 5xx,
 *   and a timeout or a connection error after sending.
 * - `paid`: chat completions, embeddings and rerank. Also a 5xx that carries
 *   the API's own error envelope, but not a bare page from a proxy or
 *   gateway, and not a timeout or a connection error once the request was
 *   sent: the call may have completed and been charged.
 * - `recreate`: voices.update and voices.replaceAudio. Also a 5xx that
 *   carries the API's own error envelope, but not a bare gateway page, and
 *   not after sending, since either may still be re-creating the voice.
 * - `once`: apiKeys.create. Nothing more, since a retry could create a
 *   second key.
 */
export type RetryClass = "safe" | "idempotent" | "paid" | "recreate" | "once";

/**
 * Why an attempt failed. A `"status"` failure's `enveloped` says whether the
 * body was the API's own error envelope (its `code` was set): a 5xx without
 * one is a proxy's or gateway's own page, not the API itself.
 */
export type AttemptFailure =
    | {kind: "status"; status: number; enveloped: boolean}
    | {kind: "timeout"}
    | {kind: "connection"; beforeSend: boolean};

/** Whether a call of this class may try again after this failure. */
export function isRetryable(retryClass: RetryClass, failure: AttemptFailure): boolean {
    const afterSending = retryClass === "safe" || retryClass === "idempotent";
    switch (failure.kind) {
        case "status":
            if (failure.status === 429) return true;
            if (retryClass === "safe") return [500, 502, 503, 504].includes(failure.status);
            if (retryClass === "once" || failure.status < 500) return false;
            // A bare 5xx from a proxy or gateway may mean the server is still working: paid and
            // recreate calls retry it only when it carries the API's own error envelope.
            return retryClass === "idempotent" || failure.enveloped;
        case "timeout":
            return afterSending;
        case "connection":
            return failure.beforeSend || afterSending;
    }
}

/**
 * The longest Retry-After the SDK waits, in seconds. A longer one, such as a
 * maintenance window, raises the error at once instead.
 */
export const MAX_RETRY_AFTER_SECONDS = 60;

/**
 * Milliseconds to wait before retry number `retry` (0 for the first): the
 * server's Retry-After when it sent one, else 0.5 s × 2^retry plus up to 25%
 * jitter, capped at 8 s. Null means don't retry: the server asked for more
 * than MAX_RETRY_AFTER_SECONDS.
 */
export function retryDelay(retry: number, retryAfterSeconds: number | null, random: () => number): number | null {
    if (retryAfterSeconds !== null) return retryAfterSeconds > MAX_RETRY_AFTER_SECONDS ? null : retryAfterSeconds * 1000;
    return Math.min(8000, 500 * 2 ** retry * (1 + 0.25 * random()));
}

// Node (undici) and Bun put these codes on a fetch failure's cause when no connection was made.
const NOT_SENT = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "ConnectionRefused", "FailedToOpenSocket"]);

function notSent(error: unknown, depth: number): boolean {
    if (depth > 5 || typeof error !== "object" || error === null) return false;
    const {code, cause, errors} = error as {code?: unknown; cause?: unknown; errors?: unknown};
    if (typeof code === "string" && NOT_SENT.has(code)) return true;
    if (Array.isArray(errors) && errors.some((inner) => notSent(inner, depth + 1))) return true;
    return notSent(cause, depth + 1);
}

/**
 * Whether a fetch failure surely happened before the request was sent: a
 * refused connection, a failed DNS lookup, an unreachable network or a
 * connect timeout, told by the `code` on the error, its causes, or an
 * AggregateError's errors. Any other failure may have reached the server.
 */
export function failedBeforeSending(error: unknown): boolean {
    return notSent(error, 0);
}
