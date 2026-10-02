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
use Naiuz\Exceptions\NeuronAIException;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Guzzle 7 or 8, given or made by the SDK. Each attempt sends Guzzle's own `timeout` option, which wins over the
 * client's: with the curl extension it bounds the whole transfer, so the answer's body is read within it too.
 *
 * Guzzle streams an answer only through PHP's own stream handler, which needs `allow_url_fopen`: without it, a stream
 * goes through curl, which reads the whole answer before handing it over, and its timeout cuts a long one short. So
 * open() refuses a stream then, before anything is sent.
 *
 * @internal
 */
final readonly class GuzzleTransport implements Transport
{
    /** curl's CURLE_OPERATION_TIMEDOUT, which Guzzle 7 reports in an exception's handler context. */
    private const CURL_TIMED_OUT = 28;

    /**
     * @param (\Closure(): bool)|null $urlFopen Says whether PHP's `allow_url_fopen` is on; ini_get() by default.
     */
    public function __construct(private ClientInterface $client, private ?\Closure $urlFopen = null) {}

    public function fetch(#[\SensitiveParameter] RequestInterface $request, float $timeout): Answer
    {
        $deadline = Clock::monotonic() + $timeout;

        return Body::answer($this->send($request, $timeout, false, $deadline), $deadline);
    }

    /** @throws NeuronAIException when allow_url_fopen is off, so Guzzle can't stream */
    public function open(#[\SensitiveParameter] RequestInterface $request, float $timeout): ResponseInterface
    {
        if (!($this->urlFopen ?? self::urlFopen(...))()) {
            throw new NeuronAIException("A stream through Guzzle needs PHP's allow_url_fopen setting, which is off: without it, Guzzle reads the whole answer before handing it over, and the timeout cuts a long one short. Turn allow_url_fopen on, or pass Symfony HttpClient's Psr18Client as http_client.");
        }

        return $this->send($request, $timeout, true, Clock::monotonic() + $timeout);
    }

    /** Whether PHP's allow_url_fopen is on: Guzzle's stream handler opens the connection with it. */
    private static function urlFopen(): bool
    {
        return filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOL);
    }

    private function send(#[\SensitiveParameter] RequestInterface $request, float $timeout, bool $stream, float $deadline): ResponseInterface
    {
        $seconds = Clock::forClient($timeout);
        // As Guzzle's own sendRequest() does: no redirects, and an error status comes back as an answer. A stream's
        // timeout bounds the wait for its headers and then each read, not the whole body.
        $options = $stream
            ? ['stream' => true, 'timeout' => $seconds, ...self::readTimeout($seconds), 'allow_redirects' => false, 'http_errors' => false]
            : ['timeout' => $seconds, 'allow_redirects' => false, 'http_errors' => false];
        try {
            return $this->client->send($request, $options);
        } catch (GuzzleException $error) {
            $timedOut = self::timedOut($error) || Clock::reached($deadline);

            throw new TransportFailure(ErrorFactory::rootMessage($error), $timedOut, self::beforeSend($error));
        }
    }

    /**
     * A stream's bound on each read. Guzzle 8 takes it as read_timeout. Guzzle 7's stream handler scales that option's
     * fraction of a second ten times too short (0.3 s waits 0.03 s), so there the stream relies on timeout alone,
     * which that handler applies to each read in full.
     *
     * @return array{read_timeout?: float}
     */
    private static function readTimeout(float $seconds): array
    {
        $constant = ClientInterface::class . '::MAJOR_VERSION';
        $major = \defined($constant) ? \constant($constant) : null;

        return is_int($major) && $major >= 8 ? ['read_timeout' => $seconds] : [];
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
