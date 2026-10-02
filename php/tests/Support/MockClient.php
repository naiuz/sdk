<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use PHPUnit\Framework\AssertionFailedError;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * A PSR-18 client for the tests: it answers the n-th request with the n-th reply, and records every request.
 *
 * A reply is an answer, an exception to throw, or a function of the request that gives one of those.
 */
final class MockClient implements ClientInterface, \Countable
{
    /** @var list<RequestInterface> */
    public array $requests = [];

    /** @var list<ResponseInterface|\Throwable|\Closure(RequestInterface): ResponseInterface> */
    private array $replies;

    /** @param ResponseInterface|\Throwable|\Closure(RequestInterface): ResponseInterface ...$replies */
    public function __construct(ResponseInterface|\Throwable|\Closure ...$replies)
    {
        $this->replies = array_values($replies);
    }

    /** How many requests were sent. */
    public function count(): int
    {
        return count($this->requests);
    }

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $this->requests[] = $request;
        $reply = $this->replies[count($this->requests) - 1] ?? null;
        if ($reply === null) {
            throw new AssertionFailedError(sprintf('Unexpected request %d: %s %s', count($this->requests), $request->getMethod(), $request->getUri()));
        }
        if ($reply instanceof \Throwable) {
            throw $reply;
        }

        return $reply instanceof ResponseInterface ? $reply : $reply($request);
    }
}
