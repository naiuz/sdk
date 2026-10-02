<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\ErrorFactory;
use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\APITimeoutException;
use Naiuz\Exceptions\AuthenticationException;
use Naiuz\Exceptions\BadRequestException;
use Naiuz\Exceptions\ConflictException;
use Naiuz\Exceptions\GoneException;
use Naiuz\Exceptions\InsufficientQuotaException;
use Naiuz\Exceptions\InternalServerException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Exceptions\NotFoundException;
use Naiuz\Exceptions\PayloadTooLargeException;
use Naiuz\Exceptions\PermissionDeniedException;
use Naiuz\Exceptions\RateLimitException;
use Naiuz\Exceptions\UnprocessableEntityException;
use Naiuz\Exceptions\UnsupportedMediaTypeException;
use PHPUnit\Framework\Attributes\DataProvider;

final class ErrorsTest extends TestCase
{
    /** Tue, 29 Sep 2026 10:00:00 GMT. */
    private const NOW = 1790676000.0;

    public function test_every_exception_is_a_neuronai_exception_and_a_timeout_is_a_connection_error(): void
    {
        self::assertSame([APIConnectionException::class, NeuronAIException::class, \RuntimeException::class, \Exception::class], array_values(class_parents(APITimeoutException::class) ?: []));
        self::assertSame([APIException::class, NeuronAIException::class, \RuntimeException::class, \Exception::class], array_values(class_parents(RateLimitException::class) ?: []));
        self::assertSame('Request timed out.', (new APITimeoutException())->getMessage());
        self::assertSame('Connection error.', (new APIConnectionException())->getMessage());
    }

    /** @param class-string<APIException> $class */
    #[DataProvider('statuses')]
    public function test_a_status_throws_its_own_class(int $status, string $class): void
    {
        $error = ErrorFactory::make($status, '', [], self::envelope('server_error'));
        self::assertSame($class, $error::class);
        self::assertSame($status, $error->status);
        self::assertSame($status, $error->getCode());
    }

    /** @return iterable<string, array{int, class-string<APIException>}> */
    public static function statuses(): iterable
    {
        yield '400' => [400, BadRequestException::class];
        yield '401' => [401, AuthenticationException::class];
        yield '402' => [402, InsufficientQuotaException::class];
        yield '403' => [403, PermissionDeniedException::class];
        yield '404' => [404, NotFoundException::class];
        yield '409' => [409, ConflictException::class];
        yield '410' => [410, GoneException::class];
        yield '413' => [413, PayloadTooLargeException::class];
        yield '415' => [415, UnsupportedMediaTypeException::class];
        yield '422' => [422, UnprocessableEntityException::class];
        yield '429' => [429, RateLimitException::class];
        yield '500' => [500, InternalServerException::class];
        yield '502' => [502, InternalServerException::class];
        yield '503' => [503, InternalServerException::class];
        yield '599' => [599, InternalServerException::class];
    }

    #[DataProvider('otherStatuses')]
    public function test_any_other_status_throws_api_exception_itself(int $status): void
    {
        self::assertSame(APIException::class, ErrorFactory::make($status, '', [], self::envelope('method_not_allowed'))::class);
    }

    /** @return iterable<string, array{int}> */
    public static function otherStatuses(): iterable
    {
        foreach ([200, 405, 418, 451] as $status) {
            yield (string) $status => [$status];
        }
    }

    public function test_an_error_in_the_envelope_carries_its_details_and_the_headers(): void
    {
        $headers = ['x-request-id' => 'req-1'];
        $body = json_encode([
            'error' => [
                'type' => 'invalid_request_error',
                'code' => 'invalid_request',
                'message' => 'The text field is required.',
                'param' => 'text',
                'fields' => ['text' => 'The text field is required.', 'odd' => 1],
            ],
            'request_id' => 'req-1',
        ], JSON_THROW_ON_ERROR);
        $error = ErrorFactory::make(422, 'Unprocessable Content', $headers, $body);
        self::assertInstanceOf(UnprocessableEntityException::class, $error);
        self::assertSame(['invalid_request_error', 'invalid_request', 'The text field is required.', 'text'], [$error->type, $error->error_code, $error->getMessage(), $error->param]);
        self::assertSame(['text' => 'The text field is required.'], $error->fields);
        self::assertSame('req-1', $error->request_id);
        self::assertSame($headers, $error->headers);
        self::assertSame(422, $error->getCode());
    }

    public function test_a_code_the_sdk_doesn_t_know_stays_a_plain_string(): void
    {
        self::assertSame('brand_new_code', ErrorFactory::make(400, '', [], self::envelope('brand_new_code'))->error_code);
    }

    public function test_fields_is_null_unless_the_envelope_sends_them(): void
    {
        self::assertNull(ErrorFactory::make(404, '', [], self::envelope('not_found'))->fields);
    }

    public function test_the_request_id_falls_back_to_x_request_id(): void
    {
        $body = '{"error": {"type": "invalid_request_error", "code": "not_found", "message": "No.", "param": null}}';
        self::assertSame('req-header', ErrorFactory::make(404, '', ['x-request-id' => 'req-header'], $body)->request_id);
    }

    public function test_an_answer_outside_the_envelope_still_throws_its_class_with_the_reason_and_the_body_s_start(): void
    {
        $html = '<html><head><title>502 Bad Gateway</title></head><body>' . str_repeat('x', 300) . '</body></html>';
        $error = ErrorFactory::make(502, 'Bad Gateway', ['x-request-id' => 'req-proxy'], $html);
        self::assertInstanceOf(InternalServerException::class, $error);
        self::assertSame([null, null, null, null], [$error->error_code, $error->type, $error->param, $error->fields]);
        self::assertSame('Bad Gateway: ' . substr($html, 0, 200), $error->getMessage());
        self::assertSame('req-proxy', $error->request_id);
    }

    public function test_an_empty_answer_without_a_reason_still_says_what_happened(): void
    {
        $error = ErrorFactory::make(503, '', [], '');
        self::assertInstanceOf(InternalServerException::class, $error);
        self::assertSame('HTTP 503', $error->getMessage());
        self::assertNull($error->request_id);
    }

    public function test_json_that_isn_t_the_envelope_is_like_any_other_body(): void
    {
        $error = ErrorFactory::make(500, 'Internal Server Error', [], '{"message":"Server Error"}');
        self::assertNull($error->error_code);
        self::assertSame('Internal Server Error: {"message":"Server Error"}', $error->getMessage());
    }

    public function test_the_body_s_start_counts_characters_and_replaces_bytes_that_aren_t_utf_8(): void
    {
        $cyrillic = ErrorFactory::make(502, 'Bad Gateway', [], str_repeat('ж', 250));
        self::assertSame('Bad Gateway: ' . str_repeat('ж', 200), $cyrillic->getMessage());
        $latin1 = ErrorFactory::make(502, 'Bad Gateway', [], "caf\xE9 down");
        self::assertSame("Bad Gateway: caf\u{FFFD} down", $latin1->getMessage());
    }

    public function test_retry_after_is_the_header_s_seconds_on_a_429(): void
    {
        $error = ErrorFactory::make(429, '', ['retry-after' => '12'], self::envelope('rate_limit_exceeded'), self::NOW);
        self::assertInstanceOf(RateLimitException::class, $error);
        self::assertSame(12.0, $error->retry_after);
    }

    public function test_retry_after_counts_an_http_date_from_now(): void
    {
        $error = ErrorFactory::make(429, '', ['retry-after' => 'Tue, 29 Sep 2026 10:00:05 GMT'], self::envelope('rate_limit_exceeded'), self::NOW);
        self::assertInstanceOf(RateLimitException::class, $error);
        self::assertSame(5.0, $error->retry_after);
    }

    public function test_retry_after_is_null_on_a_429_without_the_header(): void
    {
        $error = ErrorFactory::make(429, '', [], self::envelope('concurrency_limit_exceeded'), self::NOW);
        self::assertInstanceOf(RateLimitException::class, $error);
        self::assertNull($error->retry_after);
    }

    public function test_root_message_finds_the_deepest_message(): void
    {
        $error = new \RuntimeException('', 0, new \RuntimeException('All connection attempts failed', 0, new \RuntimeException('Connection refused')));
        self::assertSame('Connection refused', ErrorFactory::rootMessage($error));
        self::assertSame('Outer', ErrorFactory::rootMessage(new \RuntimeException('Outer', 0, new \RuntimeException(''))));
    }

    public function test_root_message_follows_at_most_five_previous_exceptions(): void
    {
        $error = new \RuntimeException('too deep');
        foreach (range(1, 6) as $level) {
            $error = new \RuntimeException("level {$level}", 0, $error);
        }
        self::assertSame('level 1', ErrorFactory::rootMessage($error));
    }

    public function test_a_connection_error_says_what_failed(): void
    {
        $error = ErrorFactory::connection('cURL error 7: Failed to connect', reading: false);
        self::assertSame(APIConnectionException::class, $error::class);
        self::assertSame('Connection error: cURL error 7: Failed to connect', $error->getMessage());
        self::assertNull($error->getPrevious());
        self::assertSame('Connection error.', ErrorFactory::connection('', reading: false)->getMessage());
        self::assertSame(
            'The connection failed while the response arrived: Unable to read from stream',
            ErrorFactory::connection('Unable to read from stream', reading: true)->getMessage(),
        );
    }

    private static function envelope(string $code): string
    {
        return json_encode([
            'error' => ['type' => 'invalid_request_error', 'code' => $code, 'message' => 'Something went wrong.', 'param' => null],
            'request_id' => 'req-1',
        ], JSON_THROW_ON_ERROR);
    }
}
