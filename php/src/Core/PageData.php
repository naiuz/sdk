<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * What one page of a list holds.
 *
 * @template T
 *
 * @internal
 */
final readonly class PageData
{
    /** @param list<T> $items */
    public function __construct(public array $items, public ?string $nextCursor, public ?string $requestId) {}
}
