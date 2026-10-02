<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * The URL of one call.
 *
 * @internal
 */
final class Url
{
    /**
     * A path parameter, percent-encoded per RFC 3986: every character outside the unreserved set
     * (A-Z a-z 0-9 - . _ ~) becomes UTF-8 %XX.
     */
    public static function encodePathParam(string $value): string
    {
        return rawurlencode($value);
    }

    /**
     * The URL of one call: the base URL, then the path with each `{name}` replaced by its encoded parameter, then the
     * query.
     *
     * A path parameter that is empty, "." or ".." is refused, because the URL would then name another endpoint.
     *
     * @param array<string, mixed> $pathParams
     * @param array<string, mixed> $query
     */
    public static function build(string $baseUrl, string $path, array $pathParams = [], array $query = []): string
    {
        $filled = (string) preg_replace_callback(
            '/\{([^}]+)\}/',
            static function (array $match) use ($pathParams): string {
                $value = $pathParams[$match[1]] ?? null;
                if (!is_string($value) || in_array($value, ['', '.', '..'], true)) {
                    throw new NeuronAIException(sprintf('The path parameter "%s" must be a non-empty string other than "." and "..".', $match[1]));
                }

                return self::encodePathParam($value);
            },
            $path,
        );
        $text = self::query($query);

        return rtrim($baseUrl, '/') . $filled . ($text === '' ? '' : "?{$text}");
    }

    /**
     * A call's query string, its names and values percent-encoded per RFC 3986, in order.
     *
     * A null is left out, since a query has no null. A boolean is sent as `true` or `false`, and a string or a number
     * as its text.
     *
     * @param array<string, mixed> $query
     */
    public static function query(array $query): string
    {
        $pairs = [];
        foreach ($query as $name => $value) {
            if ($value === null) {
                continue;
            }
            if (!is_scalar($value)) {
                throw new NeuronAIException(sprintf('The query parameter "%s" must be a string, a number or a boolean.', $name));
            }
            $text = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
            $pairs[] = rawurlencode($name) . '=' . rawurlencode($text);
        }

        return implode('&', $pairs);
    }
}
