<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

/**
 * The repo's spec/ directory: the contract the SDK is tested against.
 */
final class Spec
{
    public const DIR = __DIR__ . '/../../../spec';

    /**
     * A JSON file under spec/, decoded into arrays.
     *
     * @return array<mixed>
     */
    public static function read(string $path): array
    {
        $decoded = json_decode((string) file_get_contents(self::DIR . '/' . $path), true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new \UnexpectedValueException("spec/{$path} is not a JSON object.");
        }

        return $decoded;
    }

    /** The value at a path of keys inside decoded JSON, or null when nothing is there. */
    public static function at(mixed $value, string ...$keys): mixed
    {
        foreach ($keys as $key) {
            if (!is_array($value) || !array_key_exists($key, $value)) {
                return null;
            }
            $value = $value[$key];
        }

        return $value;
    }

    /** A decoded JSON scalar as text; '' for anything else. */
    public static function text(mixed $value): string
    {
        return is_scalar($value) ? (string) $value : '';
    }

    /**
     * The strings among a decoded JSON list, in order.
     *
     * @return list<string>
     */
    public static function strings(mixed $value): array
    {
        return is_array($value) ? array_values(array_filter($value, is_string(...))) : [];
    }
}
