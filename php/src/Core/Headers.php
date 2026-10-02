<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * The headers of one call.
 *
 * @internal
 */
final class Headers
{
    /** An HTTP token: what a header's name can be. */
    private const NAME = "/^[!#$%&'*+\\-.^_`|~0-9A-Za-z]+\\z/";

    /** Visible ASCII, spaces and tabs: what a header's value can be. */
    private const VALUE = '/^[\\t\\x20-\\x7e]*\\z/';

    /**
     * The headers of one call, whose body has $contentType (null for no body), all but the key's: withKey() adds it.
     *
     * Each group goes on over the ones before it: the SDK's own headers, the client's default_headers, the call's
     * Idempotency-Key, then the call's extra_headers. Every call sends `Accept: application/json`, unless it takes
     * back something else.
     *
     * @param array<string, string> $defaultHeaders
     *
     * @return array<string, string> By lower-case name.
     */
    public static function build(string $userAgent, array $defaultHeaders, APIRequest $request, ?string $contentType): array
    {
        $headers = ['accept' => $request->accept, 'user-agent' => $userAgent];
        if ($contentType !== null) {
            $headers['content-type'] = $contentType;
        }
        foreach (self::check($defaultHeaders, 'default_headers') as $name => $value) {
            $headers[$name] = $value;
        }
        if ($request->retry === RetryClass::Idempotent) {
            // After default_headers, so a client-wide Idempotency-Key can't give every call the same key.
            $key = $request->options->idempotencyKey;
            $headers['idempotency-key'] = $key === null || $key === '' ? self::uuid4() : self::check(['idempotency-key' => $key], 'idempotency_key')['idempotency-key'];
        }
        foreach (self::check($request->options->extraHeaders, 'extra_headers') as $name => $value) {
            $headers[$name] = $value;
        }

        return $headers;
    }

    /**
     * Headers a caller gives, checked: each name an HTTP token, and each value a string of visible ASCII, spaces and
     * tabs, trimmed of the spaces and tabs around it. Anything else throws NeuronAIException naming the header but
     * never its value, before the HTTP client sees it, since a client's own exception may quote the value.
     *
     * @return array<string, string> By lower-case name.
     */
    public static function check(mixed $headers, string $option): array
    {
        if (!is_array($headers)) {
            throw new NeuronAIException("{$option} must be an array of header names and values.");
        }
        $checked = [];
        foreach ($headers as $name => $value) {
            $text = is_string($value) ? trim($value, " \t") : null;
            if (!is_string($name) || preg_match(self::NAME, $name) !== 1 || $text === null || preg_match(self::VALUE, $text) !== 1) {
                throw new NeuronAIException(sprintf('The header "%s" has a name or value that HTTP can\'t carry.', $name));
            }
            $checked[strtolower($name)] = $text;
        }

        return $checked;
    }

    /**
     * The headers with the key's Authorization among the SDK's own, under the caller's: an Authorization in
     * default_headers or extra_headers still wins. Every header was checked already, and the key was at the
     * client's construction, so this can't throw, and no exception carries a frame that holds the key.
     *
     * @param array<string, string> $headers
     *
     * @return array<string, string>
     */
    public static function withKey(array $headers, \SensitiveParameterValue $key): array
    {
        $value = $key->getValue();

        return ['authorization' => 'Bearer ' . (is_string($value) ? $value : ''), ...$headers];
    }

    /** A random UUID, version 4. */
    public static function uuid4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0F) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3F) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
