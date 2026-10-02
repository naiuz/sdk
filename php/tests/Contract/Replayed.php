<?php

declare(strict_types=1);

namespace Naiuz\Tests\Contract;

use Psr\Http\Message\RequestInterface;

/**
 * What replaying a fixture gave: every request sent, and the result in the fixtures README's shape.
 */
final readonly class Replayed
{
    /** @param list<RequestInterface> $requests */
    public function __construct(public array $requests, public mixed $result) {}
}
