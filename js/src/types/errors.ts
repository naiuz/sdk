/** `insufficient_quota` for 402, `rate_limit_error` for 429, `server_error` for 5xx, and `invalid_request_error` for every other 4xx. */
export type ErrorType = "invalid_request_error" | "insufficient_quota" | "rate_limit_error" | "server_error" | (string & {});

/** The body of every error answer. */
export interface ErrorEnvelope {
    error: {
        /** `insufficient_quota` for 402, `rate_limit_error` for 429, `server_error` for 5xx, and `invalid_request_error` for every other 4xx. */
        type: ErrorType;
        /** A stable, machine-readable code. The Errors page says what each one means. */
        code: string;
        /** What went wrong, written for people. Match on `code`, not on the message. */
        message: string;
        /** The first invalid parameter, or `null`. */
        param: string | null;
        /** Validation errors only: each invalid field and its first message. */
        fields?: Record<string, string>;
    };
    /** The same ID as the `X-Request-Id` header. */
    request_id: string;
}
