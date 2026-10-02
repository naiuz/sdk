<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Psr7\Request;

/**
 * Guzzle 7's ConnectException, which carries curl's handler context: Guzzle 7 throws it for a refused connection,
 * but also for a timeout or an empty answer once the request has gone out.
 */
final class Guzzle7ConnectException extends ConnectException
{
    /** @param array<string, mixed> $context */
    public function __construct(string $message, private readonly array $context)
    {
        parent::__construct($message, new Request('GET', 'https://my.neuronai.uz/api/v1'));
    }

    /** @return array<string, mixed> */
    public function getHandlerContext(): array
    {
        return $this->context;
    }
}
