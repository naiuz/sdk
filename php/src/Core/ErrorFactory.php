<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\AuthenticationException;
use Naiuz\Exceptions\BadRequestException;
use Naiuz\Exceptions\ConflictException;
use Naiuz\Exceptions\GoneException;
use Naiuz\Exceptions\InsufficientQuotaException;
use Naiuz\Exceptions\InternalServerException;
use Naiuz\Exceptions\NotFoundException;
use Naiuz\Exceptions\PayloadTooLargeException;
use Naiuz\Exceptions\PermissionDeniedException;
use Naiuz\Exceptions\RateLimitException;
use Naiuz\Exceptions\UnprocessableEntityException;
use Naiuz\Exceptions\UnsupportedMediaTypeException;

/**
 * How an answer the SDK can't use, or a connection that failed, becomes an exception.
 *
 * @internal
 */
final class ErrorFactory
{
    /** @var array<int, class-string<APIException>> */
    private const CLASS_BY_STATUS = [
        400 => BadRequestException::class,
        401 => AuthenticationException::class,
        402 => InsufficientQuotaException::class,
        403 => PermissionDeniedException::class,
        404 => NotFoundException::class,
        409 => ConflictException::class,
        410 => GoneException::class,
        413 => PayloadTooLargeException::class,
        415 => UnsupportedMediaTypeException::class,
        422 => UnprocessableEntityException::class,
    ];

    /** How deep rootMessage() follows previous exceptions. */
    private const MAX_DEPTH = 5;

    /**
     * The exception for an answer the SDK can't use: an error status, or a success whose body isn't what the call
     * returns.
     *
     * The API's envelope fills in the type, the code, the message, the param and the fields. Anything else, such as a
     * proxy's HTML page, leaves the type and the code null, and the message is the reason phrase, then the first 200
     * characters of the body, trimmed. $now (Unix seconds) is when a 429's Retry-After date counts from.
     *
     * @param array<string, string> $headers The answer's headers, by lower-case name.
     */
    public static function make(int $status, string $reason, array $headers, string $body, ?float $now = null): APIException
    {
        [$message, $type, $code, $param, $fields, $requestId] = self::fromEnvelope($headers, $body)
            ?? self::outsideEnvelope($status, $reason, $headers, $body);
        if ($status === 429) {
            $retryAfter = RetryAfter::parse($headers['retry-after'] ?? null, $now ?? microtime(true));

            return new RateLimitException($message, $status, $type, $code, $param, $fields, $requestId, $headers, $retryAfter);
        }
        $class = $status >= 500 ? InternalServerException::class : self::CLASS_BY_STATUS[$status] ?? APIException::class;

        return new $class($message, $status, $type, $code, $param, $fields, $requestId, $headers);
    }

    /**
     * The exception for a connection that failed, saying what the HTTP client reported: $reason, the deepest message
     * among its exceptions. $reading says the failure came once the answer had started to arrive.
     */
    public static function connection(string $reason, bool $reading): APIConnectionException
    {
        $head = $reading ? 'The connection failed while the response arrived' : 'Connection error';

        return new APIConnectionException($reason === '' ? "{$head}." : "{$head}: {$reason}");
    }

    /** The deepest non-empty message among the exception and those it was thrown from. */
    public static function rootMessage(\Throwable $error, int $depth = 0): string
    {
        $message = $error->getMessage();
        $previous = $error->getPrevious();
        if ($depth < self::MAX_DEPTH && $previous !== null) {
            $deeper = self::rootMessage($previous, $depth + 1);
            if ($deeper !== '') {
                return $deeper;
            }
        }

        return $message;
    }

    /**
     * @param array<string, string> $headers
     *
     * @return array{string, ?string, ?string, ?string, ?array<string, string>, ?string}|null
     */
    private static function fromEnvelope(array $headers, string $body): ?array
    {
        $envelope = json_decode($body, true);
        $error = is_array($envelope) ? $envelope['error'] ?? null : null;
        if (!is_array($error) || !is_string($error['message'] ?? null)) {
            return null;
        }
        $fields = null;
        if (is_array($error['fields'] ?? null)) {
            $fields = [];
            foreach ($error['fields'] as $name => $text) {
                if (is_string($text)) {
                    $fields[(string) $name] = $text;
                }
            }
        }
        $requestId = is_string($envelope['request_id'] ?? null) ? $envelope['request_id'] : $headers['x-request-id'] ?? null;

        return [$error['message'], self::text($error['type'] ?? null), self::text($error['code'] ?? null), self::text($error['param'] ?? null), $fields, $requestId];
    }

    /**
     * @param array<string, string> $headers
     *
     * @return array{string, null, null, null, null, ?string}
     */
    private static function outsideEnvelope(int $status, string $reason, array $headers, string $body): array
    {
        // HTTP/2 has no reason phrase, so fall back to the number.
        $head = trim($reason) !== '' ? trim($reason) : "HTTP {$status}";
        $snippet = trim(self::start(self::scrub($body), 200));

        return [$snippet === '' ? $head : "{$head}: {$snippet}", null, null, null, null, $headers['x-request-id'] ?? null];
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) ? $value : null;
    }

    /** The bytes as UTF-8 text, each invalid sequence replaced with U+FFFD. */
    private static function scrub(string $bytes): string
    {
        return htmlspecialchars_decode(htmlspecialchars($bytes, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), ENT_QUOTES);
    }

    /** The first $characters characters of UTF-8 text. */
    private static function start(string $text, int $characters): string
    {
        return preg_match('/^.{0,' . $characters . '}/su', $text, $match) === 1 ? $match[0] : substr($text, 0, $characters);
    }
}
