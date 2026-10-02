<?php

declare(strict_types=1);

namespace Naiuz\Core\Transport;

use Naiuz\Core\Answer;
use Naiuz\Core\Clock;
use Naiuz\Core\ErrorFactory;
use Psr\Http\Client\ClientExceptionInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\StreamInterface;

/**
 * Reads an answer's body piece by piece, bounded by a deadline.
 *
 * @internal
 */
final class Body
{
    /** The most a piece holds, in bytes. */
    public const PIECE = 65536;

    /**
     * The whole answer, its body read by the deadline, then closed.
     *
     * @throws TransportFailure when the body can't be read whole by the deadline
     */
    public static function answer(ResponseInterface $response, float $deadline): Answer
    {
        return new Answer($response->getStatusCode(), $response->getReasonPhrase(), self::headers($response), self::read($response->getBody(), $deadline));
    }

    /**
     * An answer's headers, by lower-case name, a repeated header's values joined with ", ".
     *
     * @return array<string, string>
     */
    public static function headers(ResponseInterface $response): array
    {
        $headers = [];
        foreach ($response->getHeaders() as $name => $values) {
            $headers[strtolower((string) $name)] = implode(', ', $values);
        }

        return $headers;
    }

    /**
     * The whole body, read piece by piece: at the first piece past the deadline it throws a timeout, so a body that
     * drips in can't outlast it. The body is closed either way.
     *
     * @throws TransportFailure
     */
    public static function read(StreamInterface $body, float $deadline): string
    {
        try {
            if ($body->isSeekable() && $body->tell() !== 0) {
                $body->rewind();
            }
            $content = '';
            while (true) {
                if (Clock::monotonic() >= $deadline) {
                    throw new TransportFailure('', timedOut: true, reading: true);
                }
                if ($body->eof()) {
                    return $content;
                }
                $content .= self::piece($body, self::PIECE, $deadline);
            }
        } finally {
            $body->close();
        }
    }

    /**
     * The next piece of the body, up to $length bytes, as a stream reads it. A read that fails throws, timed out when
     * it ends at or after $deadline.
     *
     * Some HTTP clients raise a PHP warning when a read fails, as Symfony HttpClient's PSR-7 bodies do: it is caught
     * here, so an application's error handler never sees it, and its text says what went wrong.
     *
     * @throws TransportFailure
     */
    public static function piece(StreamInterface $body, int $length, ?float $deadline = null): string
    {
        $warning = null;
        set_error_handler(static function (int $level, string $message) use (&$warning): bool {
            $warning ??= $message;

            return true;
        }, E_WARNING | E_USER_WARNING | E_NOTICE | E_USER_NOTICE);
        try {
            return $body->read($length);
        } catch (\RuntimeException|ClientExceptionInterface $error) {
            $timedOut = $deadline !== null && Clock::monotonic() >= $deadline;

            throw new TransportFailure($warning ?? ErrorFactory::rootMessage($error), $timedOut, reading: true);
        } finally {
            restore_error_handler();
        }
    }
}
