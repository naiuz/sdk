<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * The attempt a reader runs in.
 *
 * @internal
 */
final readonly class Attempt
{
    /**
     * @param float $timeout The call's timeout, in seconds.
     * @param \SensitiveParameterValue $key The API key, which redact() takes out of a text.
     */
    public function __construct(public float $timeout, private \SensitiveParameterValue $key) {}

    /** The text with every occurrence of the API key replaced, for a body that goes into an exception. */
    public function redact(string $text): string
    {
        $key = $this->key->getValue();

        return is_string($key) && $key !== '' ? str_replace($key, '[redacted]', $text) : $text;
    }

    /**
     * Headers with every occurrence of the API key in their values replaced.
     *
     * @param array<string, string> $headers
     *
     * @return array<string, string>
     */
    public function redactHeaders(array $headers): array
    {
        return array_map($this->redact(...), $headers);
    }

    /**
     * The answer with every occurrence of the API key replaced, in its reason, its headers and its body, so nothing
     * built from it can hold the key: not an exception, a frame's arguments or a result. A proxy's debugging page may
     * echo the request's Authorization header back.
     */
    public function redactAnswer(Answer $answer): Answer
    {
        return new Answer($answer->status, $this->redact($answer->reason), $this->redactHeaders($answer->headers), $this->redact($answer->body));
    }
}
