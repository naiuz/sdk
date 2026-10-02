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
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Symfony HttpClient: a PSR-18 client given, or Symfony's own client, which the SDK makes. Each attempt sets the
 * client's `timeout` (the longest silence) and `max_duration` (the whole answer, its body included), which win over
 * the client's own: its default silence of `default_socket_timeout`, 60 seconds, would otherwise end a long call
 * early. It follows no redirect (`max_redirects` 0), as Guzzle's `sendRequest()` has it: a redirect comes back as the
 * answer.
 *
 * A PSR-18 client takes the options through its `withOptions()`, which it has from Symfony 6.2 on, so an older one is
 * sent as any PSR-18 client's (Transports::for()). Symfony's own client has `withOptions()` from 5.3 on: each attempt
 * wraps it, so set, in a PSR-18 client.
 *
 * Symfony can't say whether a failed request was sent, so a failure is taken as possibly sent.
 *
 * @internal
 */
final readonly class SymfonyTransport implements Transport
{
    /** @param Psr18Client|HttpClientInterface $client A PSR-18 client of Symfony 6.2 or later, or Symfony's own client */
    public function __construct(private Psr18Client|HttpClientInterface $client) {}

    public function fetch(#[\SensitiveParameter] RequestInterface $request, float $timeout): Answer
    {
        $deadline = Clock::monotonic() + $timeout;
        $seconds = Clock::forClient($timeout);

        return Body::answer($this->send($this->set(['timeout' => $seconds, 'max_duration' => $seconds, 'max_redirects' => 0]), $request, $deadline), $deadline);
    }

    public function open(#[\SensitiveParameter] RequestInterface $request, float $timeout): ResponseInterface
    {
        return $this->send($this->set(['timeout' => Clock::forClient($timeout), 'max_duration' => 0, 'max_redirects' => 0]), $request, Clock::monotonic() + $timeout);
    }

    /**
     * The PSR-18 client to send an attempt with, its options set.
     *
     * @param array<string, mixed> $options
     */
    private function set(array $options): Psr18Client
    {
        return $this->client instanceof Psr18Client ? $this->client->withOptions($options) : new Psr18Client($this->client->withOptions($options));
    }

    private function send(Psr18Client $client, #[\SensitiveParameter] RequestInterface $request, float $deadline): ResponseInterface
    {
        try {
            return $client->sendRequest($request);
        } catch (ClientExceptionInterface $error) {
            throw new TransportFailure(ErrorFactory::rootMessage($error), self::timedOut($error) || Clock::reached($deadline));
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
