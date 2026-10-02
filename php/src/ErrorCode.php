<?php

declare(strict_types=1);

namespace Naiuz;

/**
 * Every code the API puts in its error envelope, as the OpenAPI `ErrorCode` enum lists them.
 *
 * An APIException's error_code stays a plain string, so a code the API adds later still arrives. Compare it with a
 * case's value, such as ErrorCode::InsufficientBalance->value, and never match on the message.
 */
enum ErrorCode: string
{
    /** The request is malformed or failed validation. */
    case InvalidRequest = 'invalid_request';

    /** The API key is missing or not recognized. */
    case InvalidApiKey = 'invalid_api_key';

    /** The API key is disabled; it can be enabled again. */
    case ApiKeyDisabled = 'api_key_disabled';

    /** The API key was revoked and can never be used again. */
    case ApiKeyRevoked = 'api_key_revoked';

    /** The API key is past its expiry date. */
    case ApiKeyExpired = 'api_key_expired';

    /** The organization's balance is too low for this request. */
    case InsufficientBalance = 'insufficient_balance';

    /** The request would take the API key over its monthly spend limit. */
    case SpendLimitExceeded = 'spend_limit_exceeded';

    /** The API key lacks the permission this request needs. */
    case InsufficientPermissions = 'insufficient_permissions';

    /** The request's IP address is not on the API key's allowlist. */
    case IpNotAllowed = 'ip_not_allowed';

    /** The API key belongs to a user without an organization. */
    case NoOrganization = 'no_organization';

    /** The voice_id is not usable by this account. */
    case VoiceUnavailable = 'voice_unavailable';

    /** The bot secret is wrong. */
    case InvalidBotSecret = 'invalid_bot_secret';

    /** This API key is not allowed to make this request. */
    case Forbidden = 'forbidden';

    /** The route or resource does not exist in this organization. */
    case NotFound = 'not_found';

    /** The requested model does not exist or is not available. */
    case ModelNotFound = 'model_not_found';

    /** The HTTP method is not supported on this route. */
    case MethodNotAllowed = 'method_not_allowed';

    /** The request conflicts with the current state of the resource. */
    case Conflict = 'conflict';

    /** The Idempotency-Key was already used with a different request. */
    case IdempotencyConflict = 'idempotency_conflict';

    /** The resource is no longer available. */
    case Gone = 'gone';

    /** The TTS job has not finished yet. */
    case JobNotFinished = 'job_not_finished';

    /** The TTS job failed and has no audio. */
    case JobFailed = 'job_failed';

    /** The TTS job's audio is past its retention window. */
    case AudioExpired = 'audio_expired';

    /** The input is over a size limit. */
    case InputTooLarge = 'input_too_large';

    /** The uploaded media type is not supported. */
    case UnsupportedMediaType = 'unsupported_media_type';

    /** The batch contains too many embedding inputs. */
    case BatchTooLarge = 'batch_too_large';

    /** The request contains too many documents to rerank. */
    case TooManyDocuments = 'too_many_documents';

    /** The prompt plus max_tokens exceeds the model's context length. */
    case ContextLengthExceeded = 'context_length_exceeded';

    /** The model server refused the input; retrying it unchanged will not succeed. */
    case UpstreamRejectedInput = 'upstream_rejected_input';

    /** The API key's per-minute request rate was exceeded. */
    case RateLimitExceeded = 'rate_limit_exceeded';

    /** Too many requests are in flight for this API key. */
    case ConcurrencyLimitExceeded = 'concurrency_limit_exceeded';

    /** The model server is at capacity; retry after a moment. */
    case UpstreamRateLimited = 'upstream_rate_limited';

    /** Too many queued or running TTS jobs for this API key. */
    case TooManyActiveJobs = 'too_many_active_jobs';

    /** An unexpected error occurred. */
    case ServerError = 'server_error';

    /** Speech or dialogue generation failed; retry after a moment. */
    case SynthesisFailed = 'synthesis_failed';

    /** Transcription failed; retry after a moment. */
    case TranscriptionFailed = 'transcription_failed';

    /** A model or voice service failed; retry after a moment. */
    case UpstreamError = 'upstream_error';

    /** A required service is temporarily unavailable. */
    case ServiceUnavailable = 'service_unavailable';

    /** Audio was generated but could not be stored for an idempotent retry. */
    case StorageFailed = 'storage_failed';
}
