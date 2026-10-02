<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * Which failures a call may retry, and how long it waits before trying again.
 *
 * @internal
 */
final class RetryPolicy
{
    /** The longest `Retry-After` the SDK waits, in seconds. A longer one, such as a maintenance window's, fails the call at once. */
    public const MAX_RETRY_AFTER_SECONDS = 60.0;

    /** Whether a call of this class may try again after this failure. */
    public static function isRetryable(RetryClass $retry, AttemptFailure $failure): bool
    {
        $afterSending = $retry === RetryClass::Safe || $retry === RetryClass::Idempotent;
        if ($failure instanceof StatusFailure) {
            if ($failure->status === 429) {
                return true;
            }
            if ($retry === RetryClass::Safe) {
                return in_array($failure->status, [500, 502, 503, 504], true);
            }
            if ($retry === RetryClass::Once || $failure->status < 500) {
                return false;
            }

            // A bare 5xx from a proxy or gateway may mean the server is still working: paid and recreate calls retry
            // it only when it carries the API's own error envelope.
            return $retry === RetryClass::Idempotent || $failure->enveloped;
        }
        if ($failure instanceof ConnectionFailure) {
            return $failure->beforeSend || $afterSending;
        }

        return $afterSending;
    }

    /**
     * Seconds to wait before retry number $retry (0 for the first), or null to not retry at all.
     *
     * The server's Retry-After when it sent one, else 0.5 s × 2^retry plus up to 25% jitter, capped at 8 s. Null means
     * the server asked for more than MAX_RETRY_AFTER_SECONDS.
     *
     * @param \Closure(): float $random A number in [0, 1).
     */
    public static function delay(int $retry, ?float $retryAfter, \Closure $random): ?float
    {
        if ($retryAfter !== null) {
            return $retryAfter > self::MAX_RETRY_AFTER_SECONDS ? null : $retryAfter;
        }

        // 2^5 already passes the cap, so a larger exponent can't overflow.
        return min(8.0, 0.5 * 2 ** min($retry, 5) * (1 + 0.25 * $random()));
    }
}
