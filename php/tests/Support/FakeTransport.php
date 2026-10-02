<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use Naiuz\Core\Answer;
use Naiuz\Core\Transport\Transport;
use Naiuz\Core\Transport\TransportFailure;
use PHPUnit\Framework\AssertionFailedError;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * A transport for the tests, for failures a PSR-18 client can't report: it answers the n-th attempt with the n-th
 * reply, an answer or a failure, and records every request.
 */
final class FakeTransport implements Transport
{
    /** @var list<RequestInterface> */
    public array $requests = [];

    /** @var list<Answer|TransportFailure> */
    private array $replies;

    public function __construct(Answer|TransportFailure ...$replies)
    {
        $this->replies = array_values($replies);
    }

    /** A refused connection: nothing was sent. */
    public static function refused(): TransportFailure
    {
        return new TransportFailure('Failed to connect to my.neuronai.uz port 443: Connection refused', timedOut: false, beforeSend: true);
    }

    /** A connection that couldn't be made in time: nothing was sent. */
    public static function connectTimeout(): TransportFailure
    {
        return new TransportFailure('Connection timed out', timedOut: true, beforeSend: true);
    }

    public static function ok(string $body): Answer
    {
        return new Answer(200, 'OK', ['content-type' => 'application/json'], $body);
    }

    public function fetch(#[\SensitiveParameter] RequestInterface $request, float $timeout): Answer
    {
        $this->requests[] = $request;
        $reply = $this->replies[count($this->requests) - 1] ?? throw new AssertionFailedError('Unexpected request ' . count($this->requests));
        if ($reply instanceof TransportFailure) {
            throw $reply;
        }

        return $reply;
    }

    public function open(#[\SensitiveParameter] RequestInterface $request, float $timeout): ResponseInterface
    {
        throw new AssertionFailedError('The fake transport opens no streams.');
    }
}
