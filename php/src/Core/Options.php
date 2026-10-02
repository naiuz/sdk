<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;
use Naiuz\NeuronAI;

/**
 * The client's options and each call's: where each comes from, and the checks on it.
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
        return self::checkSeconds('timeout', $value);
    }

    /** An option given in seconds, checked: a number, more than 0 and at most MAX_TIMEOUT. */
    public static function checkSeconds(string $name, mixed $value): float
    {
        if ((!is_int($value) && !is_float($value)) || !($value > 0 && $value <= self::MAX_TIMEOUT)) {
            throw new NeuronAIException("{$name} must be a number of seconds, more than 0 and at most 2147483.647.");
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

    /**
     * The API key: $value, else NEURONAI_API_KEY, trimmed, wrapped so no dump or trace can show it.
     *
     * Missing, or holding a character a header can't carry, it throws NeuronAIException, whose message never quotes it.
     */
    public static function apiKey(#[\SensitiveParameter] mixed $value): \SensitiveParameterValue
    {
        if ($value !== null && !is_string($value)) {
            throw new NeuronAIException('api_key must be a string.');
        }
        $key = trim($value ?? self::environment('NEURONAI_API_KEY') ?? '');
        if ($key === '') {
            throw new NeuronAIException('The API key is missing: pass api_key, or set NEURONAI_API_KEY.');
        }
        // Visible ASCII only: a space or a line break inside the key would break the Authorization header.
        if (preg_match('/^[\x21-\x7e]+\z/', $key) !== 1) {
            throw new NeuronAIException("The API key contains a space, a line break or another character a header can't carry. Check how it was copied.");
        }

        return new \SensitiveParameterValue($key);
    }

    /** The API's address: $value, else NEURONAI_BASE_URL, else the default, without a trailing slash. */
    public static function baseUrl(mixed $value): string
    {
        if ($value !== null && !is_string($value)) {
            throw new NeuronAIException('base_url must be a string.');
        }
        $base = rtrim(trim($value ?? self::environment('NEURONAI_BASE_URL') ?? NeuronAI::DEFAULT_BASE_URL), '/');
        $parts = parse_url($base);
        $scheme = strtolower($parts['scheme'] ?? '');
        // A host name, or an IPv6 address in brackets.
        $host = preg_match('/^(\[[0-9A-Fa-f:.]+\]|[^\s\[\]]+)\z/', $parts['host'] ?? '') === 1;
        if ($parts === false || !in_array($scheme, ['http', 'https'], true) || !$host) {
            throw new NeuronAIException(sprintf('base_url must be an http or https URL, not "%s".', $base));
        }

        return $base;
    }

    /**
     * An environment variable, trimmed, as $_SERVER, $_ENV or getenv() holds it, whichever a .env loader filled; null
     * when it is unset or empty.
     */
    public static function environment(string $name): ?string
    {
        foreach ([$_SERVER[$name] ?? null, $_ENV[$name] ?? null, getenv($name)] as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    /** The User-Agent the SDK sends: `naiuz-php/<version> (PHP <major.minor>)`. */
    public static function userAgent(): string
    {
        return sprintf('naiuz-php/%s (PHP %d.%d)', NeuronAI::VERSION, PHP_MAJOR_VERSION, PHP_MINOR_VERSION);
    }
}
