<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use GuzzleHttp\Psr7\Request;
use Psr\Http\Client\NetworkExceptionInterface;
use Psr\Http\Message\RequestInterface;

/**
 * A PSR-18 client's network failure, for the tests.
 */
final class NetworkError extends \RuntimeException implements NetworkExceptionInterface
{
    public function __construct(string $message, ?\Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }

    /** A failure after the request went out: the connection was reset. */
    public static function reset(): self
    {
        return new self('Connection reset by peer');
    }

    public function getRequest(): RequestInterface
    {
        return new Request('GET', 'https://my.neuronai.uz/api/v1');
    }
}
