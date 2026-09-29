/**
 * Every `code` the API documents, as the OpenAPI `ErrorCode` enum lists them.
 *
 * `APIError.code` stays a plain string, so a code the API adds later still
 * arrives. Compare it with these members, and never match on `message`.
 */
export enum ErrorCode {
    /** The request is malformed or failed validation. */
    InvalidRequest = "invalid_request",
    /** The API key is missing or not recognized. */
    InvalidApiKey = "invalid_api_key",
    /** The API key is disabled; it can be enabled again. */
    ApiKeyDisabled = "api_key_disabled",
    /** The API key was revoked and can never be used again. */
    ApiKeyRevoked = "api_key_revoked",
    /** The API key is past its expiry date. */
    ApiKeyExpired = "api_key_expired",
    /** The organization's balance is too low for this request. */
    InsufficientBalance = "insufficient_balance",
    /** The request would take the API key over its monthly spend limit. */
    SpendLimitExceeded = "spend_limit_exceeded",
    /** The API key lacks the permission this request needs. */
    InsufficientPermissions = "insufficient_permissions",
    /** The request's IP address is not on the API key's allowlist. */
    IpNotAllowed = "ip_not_allowed",
    /** The API key belongs to a user without an organization. */
    NoOrganization = "no_organization",
    /** The voice_id is not usable by this account. */
    VoiceUnavailable = "voice_unavailable",
    /** The bot secret is wrong. */
    InvalidBotSecret = "invalid_bot_secret",
    /** This API key is not allowed to make this request. */
    Forbidden = "forbidden",
    /** The route or resource does not exist in this organization. */
    NotFound = "not_found",
    /** The requested model does not exist or is not available. */
    ModelNotFound = "model_not_found",
    /** The HTTP method is not supported on this route. */
    MethodNotAllowed = "method_not_allowed",
    /** The request conflicts with the current state of the resource. */
    Conflict = "conflict",
    /** The Idempotency-Key was already used with a different request. */
    IdempotencyConflict = "idempotency_conflict",
    /** The resource is no longer available. */
    Gone = "gone",
    /** The TTS job has not finished yet. */
    JobNotFinished = "job_not_finished",
    /** The TTS job failed and has no audio. */
    JobFailed = "job_failed",
    /** The TTS job's audio is past its retention window. */
    AudioExpired = "audio_expired",
    /** The input is over a size limit. */
    InputTooLarge = "input_too_large",
    /** The uploaded media type is not supported. */
    UnsupportedMediaType = "unsupported_media_type",
    /** The batch contains too many embedding inputs. */
    BatchTooLarge = "batch_too_large",
    /** The request contains too many documents to rerank. */
    TooManyDocuments = "too_many_documents",
    /** The prompt plus max_tokens exceeds the model's context length. */
    ContextLengthExceeded = "context_length_exceeded",
    /** The model server refused the input; retrying it unchanged will not succeed. */
    UpstreamRejectedInput = "upstream_rejected_input",
    /** The API key's per-minute request rate was exceeded. */
    RateLimitExceeded = "rate_limit_exceeded",
    /** Too many requests are in flight for this API key. */
    ConcurrencyLimitExceeded = "concurrency_limit_exceeded",
    /** The model server is at capacity; retry after a moment. */
    UpstreamRateLimited = "upstream_rate_limited",
    /** Too many queued or running TTS jobs for this API key. */
    TooManyActiveJobs = "too_many_active_jobs",
    /** An unexpected error occurred. */
    ServerError = "server_error",
    /** Speech or dialogue generation failed; retry after a moment. */
    SynthesisFailed = "synthesis_failed",
    /** Transcription failed; retry after a moment. */
    TranscriptionFailed = "transcription_failed",
    /** A model or voice service failed; retry after a moment. */
    UpstreamError = "upstream_error",
    /** A required service is temporarily unavailable. */
    ServiceUnavailable = "service_unavailable",
    /** Audio was generated but could not be stored for an idempotent retry. */
    StorageFailed = "storage_failed",
}
