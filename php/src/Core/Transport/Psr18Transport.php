<?php

declare(strict_types=1);

namespace Naiuz\Core\Transport;

use Naiuz\Core\Answer;
use Naiuz\Core\Clock;
use Naiuz\Core\ErrorFactory;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Any PSR-18 client the SDK can't configure: it keeps its own timeouts.
 *
 * The SDK bounds what it reads itself: past the attempt's deadline it stops reading a body, piece by piece, and an
 * answer that comes after the deadline counts as a timeout. It can't cut short a wait inside the client, and can't
 * tell whether a failed request was sent, so a failure is taken as possibly sent.
 *
 * @internal
 */
final readonly class Psr18Transport implements Transport
{
    public function __construct(private ClientInterface $client) {}

    public function fetch(#[\SensitiveParameter] RequestInterface $request, float $timeout): Answer
    {
        $deadline = Clock::monotonic() + $timeout;

        return Body::answer($this->send($request, $deadline), $deadline);
    }

    public function open(#[\SensitiveParameter] RequestInterface $request, float $timeout): ResponseInterface
    {
        return $this->send($request, Clock::monotonic() + $timeout);
    }

    private function send(#[\SensitiveParameter] RequestInterface $request, float $deadline): ResponseInterface
    {
        try {
            $response = $this->client->sendRequest($request);
        } catch (ClientExceptionInterface $error) {
            throw new TransportFailure(ErrorFactory::rootMessage($error), timedOut: Clock::monotonic() >= $deadline);
        }
        if (Clock::monotonic() >= $deadline) {
            $response->getBody()->close();

            throw new TransportFailure('', timedOut: true);
        }

        return $response;
    }
}
