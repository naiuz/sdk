<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * An answer, its body read whole.
 *
 * @internal
 */
final readonly class Answer
{
    /** @param array<string, string> $headers By lower-case name; a repeated header's values are joined with ", ". */
    public function __construct(public int $status, public string $reason, public array $headers, public string $body) {}

    /** Whether the status is a success: 2xx. */
    public function isSuccess(): bool
    {
        return $this->status >= 200 && $this->status < 300;
    }
}
