<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * How long a `Retry-After` header asks the client to wait.
 *
 * @internal
 */
final class RetryAfter
{
    /** The forms an HTTP date takes: IMF-fixdate, then the obsolete RFC 850 and asctime forms. */
    private const DATE_FORMATS = ['D, d M Y H:i:s \G\M\T', 'l, d-M-y H:i:s \G\M\T', 'D M j H:i:s Y'];

    /**
     * The seconds a `Retry-After` header asks for, or null when there is none or it can't be read.
     *
     * The header holds either seconds or an HTTP date. A date counts from $now (Unix seconds), rounded up, and never
     * below 0.
     */
    public static function parse(?string $value, float $now): ?float
    {
        if ($value === null) {
            return null;
        }
        $text = trim($value);
        if (preg_match('/^\d+(\.\d+)?$/', $text) === 1) {
            return (float) $text;
        }
        // An HTTP date starts with the day's name, such as "Wed, 21 Oct 2026 07:28:00 GMT".
        if (preg_match('/^[A-Za-z]{3}/', $text) !== 1) {
            return null;
        }
        $utc = new \DateTimeZone('UTC');
        foreach (self::DATE_FORMATS as $format) {
            $date = \DateTimeImmutable::createFromFormat('!' . $format, preg_replace('/ +/', ' ', $text) ?? $text, $utc);
            $problems = \DateTimeImmutable::getLastErrors();
            if ($date !== false && ($problems === false || $problems['warning_count'] + $problems['error_count'] === 0)) {
                return (float) max(0, (int) ceil($date->getTimestamp() - $now));
            }
        }

        return null;
    }
}
