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
}
