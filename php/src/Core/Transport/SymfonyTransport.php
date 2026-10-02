<?php

declare(strict_types=1);

namespace Naiuz\Core\Transport;

use Naiuz\Core\Answer;
use Naiuz\Core\Clock;
use Naiuz\Core\ErrorFactory;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Symfony\Component\HttpClient\Psr18Client;
use Symfony\Contracts\HttpClient\Exception\TimeoutExceptionInterface;

/**
 * Symfony HttpClient, through its PSR-18 client, given or made by the SDK. Each attempt sets the client's `timeout`
 * (the longest silence) and `max_duration` (the whole answer, its body included), which win over the client's own:
 * its default silence of `default_socket_timeout`, 60 seconds, would otherwise end a long call early.
 *
 * Symfony can't say whether a failed request was sent, so a failure is taken as possibly sent.
 *
 * @internal
 */
final readonly class SymfonyTransport implements Transport
{
    public function __construct(private Psr18Client $client) {}

    public function fetch(#[\SensitiveParameter] RequestInterface $request, float $timeout): Answer
    {
        $deadline = Clock::monotonic() + $timeout;
        $seconds = Clock::forClient($timeout);

        return Body::answer($this->send($this->client->withOptions(['timeout' => $seconds, 'max_duration' => $seconds]), $request, $deadline), $deadline);
    }

    public function open(#[\SensitiveParameter] RequestInterface $request, float $timeout): ResponseInterface
    {
        return $this->send($this->client->withOptions(['timeout' => Clock::forClient($timeout), 'max_duration' => 0]), $request, Clock::monotonic() + $timeout);
    }

    private function send(Psr18Client $client, #[\SensitiveParameter] RequestInterface $request, float $deadline): ResponseInterface
    {
        try {
            return $client->sendRequest($request);
        } catch (ClientExceptionInterface $error) {
            throw new TransportFailure(ErrorFactory::rootMessage($error), self::timedOut($error) || Clock::monotonic() >= $deadline);
        }
    }

    private static function timedOut(\Throwable $error): bool
    {
        for ($cause = $error; $cause !== null; $cause = $cause->getPrevious()) {
            if ($cause instanceof TimeoutExceptionInterface) {
                return true;
            }
        }

        return false;
    }
}
