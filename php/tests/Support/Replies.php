<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use GuzzleHttp\Psr7\Response;
use Psr\Http\Message\ResponseInterface;

/**
 * The answers the tests reply with.
 */
final class Replies
{
    /** @param array<string, string> $headers */
    public static function json(int $status, mixed $body, array $headers = []): ResponseInterface
    {
        return new Response($status, ['content-type' => 'application/json', ...$headers], json_encode($body, JSON_THROW_ON_ERROR));
    }

    /** A `{data, request_id}` answer, with the same ID in X-Request-Id. */
    public static function envelope(mixed $data, string $requestId = 'req-1', int $status = 200): ResponseInterface
    {
        return self::json($status, ['data' => $data, 'request_id' => $requestId], ['x-request-id' => $requestId]);
    }

    /**
     * An error answer in the API's envelope.
     *
     * @param array<string, string> $headers
     */
    public static function apiError(int $status, string $code, array $headers = []): ResponseInterface
    {
        $type = match (true) {
            $status === 402 => 'insufficient_quota',
            $status === 429 => 'rate_limit_error',
            $status >= 500 => 'server_error',
            default => 'invalid_request_error',
        };
        $error = ['type' => $type, 'code' => $code, 'message' => "The {$code} message.", 'param' => null];

        return self::json($status, ['error' => $error, 'request_id' => 'req-error'], ['x-request-id' => 'req-error', ...$headers]);
    }

    /** @param array<string, string> $headers */
    public static function noContent(array $headers = []): ResponseInterface
    {
        return new Response(204, $headers);
    }

    /** A JSON answer whose body arrives over time. */
    public static function dripping(DripStream $body, int $status = 200): ResponseInterface
    {
        return new Response($status, ['content-type' => 'application/json'], $body);
    }
}
