<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Core\Transport\Body;
use Naiuz\Core\Transport\Transport;
use Naiuz\Core\Transport\TransportFailure;
use Naiuz\Exceptions\APITimeoutException;
use Psr\Http\Message\RequestFactoryInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\StreamFactoryInterface;

/**
 * The HTTP core: every call of the client goes through it.
 *
 * It builds each request, runs each attempt within its timeout, retries as the call's class allows, and turns error
 * answers into exceptions. Resources hold one and describe their calls to it.
 *
 * @internal
 */
final class HttpClient
{
    /** @var \Closure(float): void */
    private readonly \Closure $sleep;

    /** @var \Closure(): float */
    private readonly \Closure $random;

    /** @var \Closure(): float */
    private readonly \Closure $now;

    /** Where the status and headers of each answer a call takes its result from go, for withRawResponse(). */
    private ?Captured $captured = null;

    /**
     * @param \SensitiveParameterValue $apiKey The API key, checked already: visible ASCII only.
     * @param float $timeout Seconds each attempt may take, unless a call passes its own.
     * @param array<string, string> $defaultHeaders
     * @param (\Closure(float): void)|null $sleep Waits between attempts; usleep() by default.
     * @param (\Closure(): float)|null $random The jitter's random source, in [0, 1).
     * @param (\Closure(): float)|null $now The time in Unix seconds, for Retry-After dates.
     */
    public function __construct(
        private readonly \SensitiveParameterValue $apiKey,
        private readonly string $baseUrl,
        public readonly float $timeout,
        private readonly int $maxRetries,
        private readonly array $defaultHeaders,
        private readonly string $userAgent,
        private readonly Transport $transport,
        private readonly RequestFactoryInterface $requests,
        private readonly StreamFactoryInterface $streams,
        ?\Closure $sleep = null,
        ?\Closure $random = null,
        ?\Closure $now = null,
    ) {
        $this->sleep = $sleep ?? static function (float $seconds): void {
            usleep((int) round($seconds * 1_000_000));
        };
        $this->random = $random ?? static fn(): float => mt_rand(0, mt_getrandmax() - 1) / mt_getrandmax();
        $this->now = $now ?? static fn(): float => microtime(true);
    }

    /** A copy of this core that records, into $captured, the status and headers of each answer a call takes its result from. */
    public function capturingInto(Captured $captured): self
    {
        $copy = clone $this;
        $copy->captured = $captured;

        return $copy;
    }

    /**
     * Sends the call, retrying as its class allows, and returns what $reader makes of the answer.
     *
     * @template T
     *
     * @param (\Closure(Answer, Attempt): T)|TakeOver<T> $reader
     *
     * @return T
     */
    public function request(APIRequest $request, \Closure|TakeOver $reader): mixed
    {
        $options = $request->options;
        $attempt = new Attempt(Options::checkTimeout($options->timeout ?? $this->timeout), $this->apiKey);
        $maxRetries = Options::checkMaxRetries($options->maxRetries ?? $this->maxRetries);
        $body = $request->body === null ? null : Json::encode((object) $request->body);
        // Built once, so every retry sends the same Idempotency-Key. The headers are checked before the key joins them,
        // and no argument of a frame below holds it.
        $headers = Headers::build($this->userAgent, $this->defaultHeaders, $request, $body === null ? null : 'application/json');
        $psr = $this->requests->createRequest($request->method, Url::build($this->baseUrl, $request->path, $request->pathParams, $request->query));
        foreach (Headers::withKey($headers, $this->apiKey) as $name => $value) {
            $psr = $psr->withHeader($name, $value);
        }
        for ($retry = 0; ; $retry++) {
            // A fresh body each time, so a retry sends the same bytes however the last attempt left its stream.
            $outcome = $this->attempt($body === null ? $psr : $psr->withBody($this->streams->createStream($body)), $reader, $attempt);
            if ($outcome instanceof Answered) {
                $this->captured?->record($outcome->status, $outcome->headers);

                return $outcome->value;
            }
            $retryable = $retry < $maxRetries && RetryPolicy::isRetryable($request->retry, $outcome->failure);
            $delay = $retryable ? RetryPolicy::delay($retry, $outcome->retryAfter, $this->random) : null;
            if ($delay === null) {
                throw $outcome->error;
            }
            ($this->sleep)($delay);
        }
    }

    /**
     * One attempt: the request, then its answer, within the attempt's timeout.
     *
     * @template T
     *
     * @param (\Closure(Answer, Attempt): T)|TakeOver<T> $reader
     *
     * @return Answered<T>|Failed
     */
    private function attempt(#[\SensitiveParameter] RequestInterface $request, \Closure|TakeOver $reader, Attempt $attempt): Answered|Failed
    {
        try {
            $received = $reader instanceof TakeOver ? $this->open($request, $reader, $attempt) : $this->transport->fetch($request, $attempt->timeout);
        } catch (TransportFailure $failure) {
            $error = $failure->timedOut
                ? new APITimeoutException(sprintf('Request timed out after %s s.', self::seconds($attempt->timeout)))
                : ErrorFactory::connection($attempt->redact($failure->getMessage()), $failure->reading);
            // A connection that was never made sent nothing, even when it timed out, so every class may retry it.
            $why = $failure->beforeSend ? new ConnectionFailure(true) : ($failure->timedOut ? new TimeoutFailure() : new ConnectionFailure(false));

            return new Failed($error, $why, null);
        }
        if ($received instanceof ResponseInterface) {
            return $this->handOver($received, $reader, $attempt);
        }
        if (!$received->isSuccess()) {
            return $this->refused($received, $attempt);
        }
        if ($reader instanceof TakeOver) {
            // A success a reader that takes answers over can't take, such as a captive portal's page: not retried.
            throw Readers::unusable($received, $attempt);
        }

        return new Answered($reader($received, $attempt), $received->status, $received->headers);
    }

    /**
     * Opens the answer for a reader that takes answers over: a success of its media type comes back with its body
     * unread, and any other answer is read whole, by the attempt's deadline.
     *
     * @param TakeOver<mixed> $reader
     *
     * @throws TransportFailure
     */
    private function open(#[\SensitiveParameter] RequestInterface $request, TakeOver $reader, Attempt $attempt): ResponseInterface|Answer
    {
        $deadline = Clock::monotonic() + $attempt->timeout;
        $response = $this->transport->open($request, $attempt->timeout);
        $status = $response->getStatusCode();

        return $status >= 200 && $status < 300 && $reader->takes($response) ? $response : Body::answer($response, $deadline);
    }

    /**
     * Hands the open answer to the reader that takes it over, and closes its body only if the reader fails.
     *
     * @template T
     *
     * @param TakeOver<T> $reader
     *
     * @return Answered<T>
     */
    private function handOver(ResponseInterface $response, TakeOver $reader, Attempt $attempt): Answered
    {
        try {
            $value = ($reader->take)($response, $attempt);
        } catch (\Throwable $error) {
            $response->getBody()->close();

            throw $error;
        }

        return new Answered($value, $response->getStatusCode(), Body::headers($response));
    }

    /** An error answer, as the exception to throw, why, and the seconds its Retry-After asks for. */
    private function refused(Answer $answer, Attempt $attempt): Failed
    {
        $now = ($this->now)();
        $error = ErrorFactory::make($answer->status, $answer->reason, $answer->headers, $attempt->redact($answer->body), $now);

        return new Failed($error, new StatusFailure($answer->status, $error->error_code !== null), RetryAfter::parse($answer->headers['retry-after'] ?? null, $now));
    }

    /** Seconds as the shortest text that says them: 0.2, 300 or 2147483.647. */
    private static function seconds(float $seconds): string
    {
        return rtrim(rtrim(sprintf('%.3f', $seconds), '0'), '.');
    }
}
