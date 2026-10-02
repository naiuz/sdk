<?php

declare(strict_types=1);

namespace Naiuz;

use Naiuz\Core\Attempt;
use Naiuz\Core\Clock;
use Naiuz\Core\ErrorFactory;
use Naiuz\Core\EventStream;
use Naiuz\Core\Transport\Body;
use Naiuz\Core\Transport\TransportFailure;
use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\APITimeoutException;
use Naiuz\Exceptions\NeuronAIException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\StreamInterface;

/**
 * A streamed answer: loop over it with foreach for each chunk, as the server sends it.
 *
 * The request stays open while you read. Leaving the loop early, by break, return or an exception, closes it at once,
 * even while you keep the stream, and the server stops generating; so does close(). Reading on to `[DONE]` lets the
 * answer end on its own. A stream you never loop over holds its connection until you call close() or drop the stream:
 * read or close every stream. The call's timeout bounds the wait for each piece of the stream, not the whole of it. A
 * stream can be read once.
 *
 * @template-covariant T
 *
 * @implements \IteratorAggregate<int, T>
 */
final class Stream implements \IteratorAggregate
{
    /** The most seconds a stream reads on after `[DONE]` to let its answer end cleanly, however long the timeout. */
    public const MAX_DRAIN = 5.0;

    /** @var array<string, string> The answer's headers, the API key redacted, for the exceptions the stream throws. */
    private readonly array $headers;

    private bool $read = false;

    private bool $closed = false;

    /**
     * @internal
     *
     * @param \Closure(\stdClass): T $make Makes a chunk from an event's object, and throws \UnexpectedValueException when
     *     the object isn't one.
     */
    public function __construct(private readonly ResponseInterface $response, private readonly Attempt $attempt, private readonly \Closure $make)
    {
        $this->headers = $attempt->redactHeaders(Body::headers($response));
    }

    /**
     * Each chunk, as the server sends it. Leaving the loop early closes the request.
     *
     * @return \Generator<int, T, mixed, void>
     *
     * @throws NeuronAIException when the stream has been read already
     */
    public function getIterator(): \Generator
    {
        if ($this->read) {
            throw new NeuronAIException('This stream has already been read: a stream can be read once.');
        }
        $this->read = true;

        // A generator the stream doesn't keep: the loop that runs it drops it when it ends, and its finally closes the body.
        return $this->chunks();
    }

    /**
     * Stops the stream: the request is closed, the server stops generating, and a loop reading the stream ends
     * quietly. Calling it again does nothing.
     */
    public function close(): void
    {
        if (!$this->closed) {
            $this->closed = true;
            $this->response->getBody()->close();
        }
    }

    /** A stream dropped before it was read to its end closes its request. */
    public function __destruct()
    {
        $this->close();
    }

    /**
     * The chunks, read piece by piece. At `[DONE]` the stream drains the rest; an `error` event, or one that isn't a
     * chunk, throws APIException with status 200, and an end without `[DONE]` throws APIConnectionException. Once the
     * stream is closed, by close() or by the loop reading it, the generator ends at its next step.
     *
     * @return \Generator<int, T, mixed, void>
     */
    private function chunks(): \Generator
    {
        $body = $this->response->getBody();
        $events = new EventStream();
        $ready = [];
        try {
            while (!$this->closed) {
                if ($ready === []) {
                    $ready = $events->push($this->next($body) ?? throw new APIConnectionException('The stream ended before [DONE]: the answer may be cut short.'));
                    continue;
                }
                $data = array_shift($ready);
                if ($data === '[DONE]') {
                    $this->drain($body);

                    return;
                }
                yield $this->parse($data);
            }
        } finally {
            $this->close();
        }
    }

    /**
     * The next piece of the body, or null at its end. The transport's timeout bounds each wait for a piece: a read it
     * ends, or empty reads for that long, throw APITimeoutException.
     */
    private function next(StreamInterface $body): ?string
    {
        $started = Clock::monotonic();
        while (!$body->eof()) {
            try {
                $piece = Body::piece($body, Body::PIECE, $started + $this->attempt->timeout);
            } catch (TransportFailure $failure) {
                throw $failure->timedOut ? $this->stalled() : ErrorFactory::connection($this->attempt->redact($failure->getMessage()), reading: true);
            }
            if ($piece !== '') {
                return $piece;
            }
            if (Clock::monotonic() - $started >= $this->attempt->timeout) {
                throw $this->stalled();
            }
        }

        return null;
    }

    /**
     * After `[DONE]`, reads the rest of the answer and drops it, so its connection ends cleanly: until the body ends, or
     * until the first piece past the smaller of the timeout and MAX_DRAIN. A read that fails only ends the drain: the
     * answer was whole already.
     */
    private function drain(StreamInterface $body): void
    {
        $stopAt = Clock::monotonic() + min($this->attempt->timeout, self::MAX_DRAIN);
        try {
            while (!$body->eof() && Clock::monotonic() < $stopAt) {
                Body::piece($body, Body::PIECE, $stopAt);
            }
        } catch (TransportFailure) {
            // The answer was whole already.
        }
    }

    /**
     * One event's data as a chunk. An event that isn't one, such as the API's error envelope sent mid-stream, throws
     * APIException with the answer's status, 200, and the API key redacted from it.
     *
     * @return T
     */
    private function parse(#[\SensitiveParameter] string $data): mixed
    {
        $event = json_decode($data, false, 512, JSON_INVALID_UTF8_SUBSTITUTE);
        if ($event instanceof \stdClass && !($event->error ?? null) instanceof \stdClass) {
            try {
                return ($this->make)($event);
            } catch (\UnexpectedValueException) {
                // Not a chunk: thrown below, as any other event that isn't one.
            }
        }

        throw ErrorFactory::make($this->response->getStatusCode(), $this->response->getReasonPhrase(), $this->headers, $this->attempt->redact($data));
    }

    private function stalled(): APITimeoutException
    {
        return new APITimeoutException(sprintf('No part of the stream arrived within %s s.', Clock::text($this->attempt->timeout)));
    }
}
