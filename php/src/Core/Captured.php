<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * The status and headers of the answer a call took its result from, for withRawResponse().
 *
 * @internal
 */
final class Captured
{
    public int $status = 0;

    /** @var array<string, string> */
    public array $headers = [];

    /** @param array<string, string> $headers */
    public function record(int $status, array $headers): void
    {
        $this->status = $status;
        $this->headers = $headers;
    }
}
