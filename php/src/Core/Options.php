<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * The checks on the options the client and each call take.
 *
 * @internal
 */
final class Options
{
    /** The longest timeout, in seconds: the longest a JavaScript timer can wait, kept the same in every NeuronAI SDK. */
    public const MAX_TIMEOUT = 2_147_483.647;

    /** A timeout option, checked: a number of seconds, more than 0 and at most MAX_TIMEOUT. */
    public static function checkTimeout(mixed $value): float
    {
        if ((!is_int($value) && !is_float($value)) || !($value > 0 && $value <= self::MAX_TIMEOUT)) {
            throw new NeuronAIException('timeout must be a number of seconds, more than 0 and at most 2147483.647.');
        }

        return (float) $value;
    }

    /** A max_retries option, checked: a whole number, 0 or more. */
    public static function checkMaxRetries(mixed $value): int
    {
        if (!is_int($value) || $value < 0) {
            throw new NeuronAIException('max_retries must be a whole number, 0 or more.');
        }

        return $value;
    }
}
