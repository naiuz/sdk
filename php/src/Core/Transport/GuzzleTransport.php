<?php

declare(strict_types=1);

namespace Naiuz\Core\Transport;

use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\ConnectTimeoutException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\NetworkTimeoutException;
use GuzzleHttp\Exception\ResponseTimeoutException;
use Naiuz\Core\Answer;
use Naiuz\Core\Clock;
use Naiuz\Core\ErrorFactory;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Guzzle 7 or 8, given or made by the SDK. Each attempt sends Guzzle's own `timeout` option, which wins over the
 * client's: with the curl extension it bounds the whole transfer, so the answer's body is read within it too.
 *
 * @internal
 */
final readonly class GuzzleTransport implements Transport
{
    /** curl's CURLE_OPERATION_TIMEDOUT, which Guzzle 7 reports in an exception's handler context. */
    private const CURL_TIMED_OUT = 28;

    public function __construct(private ClientInterface $client) {}

    public function fetch(#[\SensitiveParameter] RequestInterface $request, float $timeout): Answer
    {
        $deadline = Clock::monotonic() + $timeout;

        return Body::answer($this->send($request, $timeout, false, $deadline), $deadline);
    }

    public function open(#[\SensitiveParameter] RequestInterface $request, float $timeout): ResponseInterface
    {
        return $this->send($request, $timeout, true, Clock::monotonic() + $timeout);
    }

    private function send(#[\SensitiveParameter] RequestInterface $request, float $timeout, bool $stream, float $deadline): ResponseInterface
    {
        $seconds = Clock::forClient($timeout);
        // As Guzzle's own sendRequest() does: no redirects, and an error status comes back as an answer. A stream's
        // timeout bounds the wait for its headers and then each read, not the whole body.
        $options = $stream
            ? ['stream' => true, 'timeout' => $seconds, 'read_timeout' => $seconds, 'allow_redirects' => false, 'http_errors' => false]
            : ['timeout' => $seconds, 'allow_redirects' => false, 'http_errors' => false];
        try {
            return $this->client->send($request, $options);
        } catch (GuzzleException $error) {
            $timedOut = self::timedOut($error) || Clock::monotonic() >= $deadline;

            throw new TransportFailure(ErrorFactory::rootMessage($error), $timedOut, self::beforeSend($error));
        }
    }

    private static function timedOut(\Throwable $error): bool
    {
        return $error instanceof ConnectTimeoutException
            || $error instanceof NetworkTimeoutException
            || $error instanceof ResponseTimeoutException
            || (self::context($error)['errno'] ?? null) === self::CURL_TIMED_OUT;
    }

    /**
     * Whether no connection was made, so nothing was sent. Guzzle 8 throws ConnectException only then. Guzzle 7 also
     * throws it for a timeout or an empty answer once the request has gone out, so there it counts only when curl
     * wrote none of the request.
     */
    private static function beforeSend(\Throwable $error): bool
    {
        if (!$error instanceof ConnectException) {
            return false;
        }
        $context = self::context($error);

        return !array_key_exists('errno', $context) || ($context['request_size'] ?? 0) === 0;
    }

    /**
     * Guzzle 7's handler context: curl's error number and its transfer info. Guzzle 8 has none.
     *
     * @return array<array-key, mixed>
     */
    private static function context(\Throwable $error): array
    {
        $read = [$error, 'getHandlerContext'];
        $context = is_callable($read) ? $read() : [];

        return is_array($context) ? $context : [];
    }
}
