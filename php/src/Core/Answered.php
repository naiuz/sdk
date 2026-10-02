<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * An attempt that got its result.
 *
 * @template T
 *
 * @internal
 */
final readonly class Answered
{
    /**
     * @param T $value
     * @param array<string, string> $headers
     */
    public function __construct(public mixed $value, public int $status, public array $headers) {}
}
