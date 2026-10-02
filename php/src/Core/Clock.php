<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * The time, for deadlines.
 *
 * @internal
 */
final class Clock
{
    /** Seconds on a clock that never goes back, for deadlines. */
    public static function monotonic(): float
    {
        return hrtime(true) / 1e9;
    }

    /** A timeout for an HTTP client, in seconds, rounded up to whole milliseconds, so its timer never fires first. */
    public static function forClient(float $seconds): float
    {
        return ceil($seconds * 1000) / 1000;
    }

    /** Seconds as the shortest text that says them, for a message: 0.2, 300 or 2147483.647. */
    public static function text(float $seconds): string
    {
        return rtrim(rtrim(sprintf('%.3f', $seconds), '0'), '.');
    }
}
