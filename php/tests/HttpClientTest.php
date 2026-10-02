<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Core\APIRequest;
use Naiuz\Core\Captured;
use Naiuz\Core\Form;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\APITimeoutException;
use Naiuz\Exceptions\ConflictException;
use Naiuz\Exceptions\InternalServerException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Exceptions\NotFoundException;
use Naiuz\Exceptions\RateLimitException;
use Naiuz\Tests\Support\DripStream;
use Naiuz\Tests\Support\FakeTransport;
use Naiuz\Tests\Support\FormParser;
use Naiuz\Tests\Support\Frames;
use Naiuz\Tests\Support\Item;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

final class HttpClientTest extends TestCase
{
    private const UUID_V4 = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

    public function test_it_sends_the_bearer_key_a_json_accept_and_the_user_agent(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'b']));
        self::item((new TestHttp($api))->http, self::balance());
        [$sent] = $api->requests;
        self::assertSame(['GET', 'https://my.neuronai.uz/api/v1/balance'], [$sent->getMethod(), (string) $sent->getUri()]);
        self::assertSame('Bearer ' . TestHttp::KEY, $sent->getHeaderLine('authorization'));
        self::assertSame('application/json', $sent->getHeaderLine('accept'));
        self::assertSame(TestHttp::USER_AGENT, $sent->getHeaderLine('user-agent'));
    }

    public function test_it_sends_a_call_s_own_accept_in_place_of_json_s(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'b']));
        self::item((new TestHttp($api))->http, new APIRequest('GET', '/balance', RetryClass::Safe, accept: 'audio/wav, application/json'));
        self::assertSame('audio/wav, application/json', $api->requests[0]->getHeaderLine('accept'));
    }

    public function test_it_sends_a_body_as_a_json_object_with_its_content_type_and_no_content_type_without_one(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'k1']), Replies::envelope(['id' => 'k1']), Replies::noContent());
        $http = (new TestHttp($api))->http;
        self::item($http, new APIRequest('PATCH', '/api-keys/{id}', RetryClass::Safe, ['id' => 'k1'], body: ['enabled' => false, 'expires_at' => null, 'name' => 'Ключ/1']));
        self::item($http, new APIRequest('PATCH', '/api-keys/{id}', RetryClass::Safe, ['id' => 'k1'], body: []));
        $http->request(new APIRequest('POST', '/api-keys/{id}/revoke', RetryClass::Safe, ['id' => 'k1']), Readers::nothing());
        self::assertSame('{"enabled":false,"expires_at":null,"name":"Ключ/1"}', (string) $api->requests[0]->getBody());
        self::assertSame('application/json', $api->requests[0]->getHeaderLine('content-type'));
        self::assertSame('{}', (string) $api->requests[1]->getBody());
        self::assertSame('', (string) $api->requests[2]->getBody());
        self::assertFalse($api->requests[2]->hasHeader('content-type'));
    }

    public function test_it_adds_the_default_headers_then_the_call_s_extra_headers_over_them(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'b']));
        $http = (new TestHttp($api, defaultHeaders: ['X-App' => 'shop', 'x-trace' => 'default']))->http;
        self::item($http, self::balance(new RequestOptions(extraHeaders: ['X-Trace' => 'call'])));
        self::assertSame(['shop', ['call']], [$api->requests[0]->getHeaderLine('x-app'), $api->requests[0]->getHeader('x-trace')]);
    }

    #[DataProvider('headersHttpCantCarry')]
    public function test_it_refuses_a_header_http_can_t_carry_naming_it_but_never_its_value(string $name, string $value): void
    {
        $api = new MockClient();
        $error = self::failure((new TestHttp($api))->http, self::balance(new RequestOptions(extraHeaders: [$name => $value])));
        self::assertSame(NeuronAIException::class, $error::class);
        self::assertSame("The header \"{$name}\" has a name or value that HTTP can't carry.", $error->getMessage());
        self::assertNull($error->getPrevious());
        // The SDK's frames hold the headers, as the caller's own frame does: only the message is the SDK's to word.
        self::assertStringNotContainsString('secret', $error->getMessage());
        self::assertSame([], $api->requests);
    }

    /** @return iterable<string, array{string, string}> */
    public static function headersHttpCantCarry(): iterable
    {
        yield 'a line break in the value' => ['x-token', "secret\nvalue"];
        yield 'a letter outside ASCII' => ['x-token', 'secret ключ'];
        yield 'a space in the name' => ['x token', 'v'];
    }

    public function test_it_refuses_a_body_json_can_t_carry_sending_nothing(): void
    {
        $api = new MockClient();
        $error = self::failure((new TestHttp($api))->http, new APIRequest('POST', '/tts/jobs', RetryClass::Idempotent, body: ['speed' => NAN]));
        self::assertStringStartsWith("The request can't be sent as JSON: ", $error->getMessage());
        self::assertSame([], $api->requests);
    }

    public function test_it_records_the_status_and_headers_of_the_answer_its_result_came_from(): void
    {
        $captured = new Captured();
        $http = (new TestHttp(new MockClient(Replies::envelope(['id' => 'job-1'], 'req-7', 202))))->http->capturingInto($captured);
        $job = self::item($http, self::createJob());
        self::assertSame('req-7', $job->request_id);
        self::assertSame([202, 'req-7'], [$captured->status, $captured->headers['x-request-id'] ?? null]);
    }

    public function test_it_throws_an_error_answer_as_its_class_with_the_envelope_s_details(): void
    {
        $error = self::failure((new TestHttp(new MockClient(Replies::apiError(404, 'not_found'))))->http, self::balance());
        self::assertInstanceOf(NotFoundException::class, $error);
        self::assertSame([404, 'not_found', 'req-error', 'The not_found message.'], [$error->status, $error->error_code, $error->request_id, $error->getMessage()]);
    }

    public function test_it_throws_api_exception_for_a_success_that_isn_t_json_without_retrying_it(): void
    {
        $api = new MockClient(new Response(200, ['content-type' => 'text/html'], '<html>login</html>'));
        $error = self::failure((new TestHttp($api))->http, self::balance());
        self::assertInstanceOf(APIException::class, $error);
        self::assertSame(200, $error->status);
        self::assertCount(1, $api->requests);
    }

    public function test_it_retries_a_503_twice_waiting_half_a_second_then_a_second_then_throws(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable'), Replies::apiError(503, 'service_unavailable'), Replies::apiError(503, 'service_unavailable'));
        $test = new TestHttp($api);
        self::assertInstanceOf(InternalServerException::class, self::failure($test->http, self::balance()));
        self::assertCount(3, $api->requests);
        self::assertSame([0.5, 1.0], $test->waits);
    }

    public function test_it_throws_the_last_error_when_every_attempt_fails_each_differently(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable'), Replies::apiError(502, 'upstream_error'), Replies::apiError(500, 'server_error'));
        $error = self::failure((new TestHttp($api))->http, self::balance());
        self::assertInstanceOf(InternalServerException::class, $error);
        self::assertSame([500, 'server_error'], [$error->status, $error->error_code]);
    }

    public function test_it_stops_as_soon_as_an_attempt_succeeds(): void
    {
        $api = new MockClient(Replies::apiError(502, 'upstream_error'), Replies::envelope(['id' => 'b', 'balance' => 5]));
        $test = new TestHttp($api);
        self::assertSame(['id' => 'b', 'balance' => 5], self::item($test->http, self::balance())->toArray());
        self::assertCount(2, $api->requests);
        self::assertSame([0.5], $test->waits);
    }

    public function test_it_adds_up_to_25_percent_jitter_to_the_wait(): void
    {
        $test = new TestHttp(new MockClient(Replies::apiError(503, 'service_unavailable'), Replies::envelope(['id' => 'b'])), random: static fn(): float => 0.5);
        self::item($test->http, self::balance());
        self::assertSame([0.5625], $test->waits);
    }

    public function test_it_never_retries_an_error_status_other_than_429_and_5xx(): void
    {
        $api = new MockClient(Replies::apiError(409, 'conflict'));
        self::assertInstanceOf(ConflictException::class, self::failure((new TestHttp($api))->http, self::balance()));
        self::assertCount(1, $api->requests);
    }

    public function test_it_makes_one_attempt_with_max_retries_0_a_call_s_value_winning(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable'));
        self::failure((new TestHttp($api, maxRetries: 2))->http, self::balance(new RequestOptions(maxRetries: 0)));
        self::assertCount(1, $api->requests);
    }

    public function test_it_refuses_an_invalid_per_call_max_retries_or_timeout_without_sending(): void
    {
        $api = new MockClient();
        $http = (new TestHttp($api))->http;
        self::assertSame('max_retries must be a whole number, 0 or more.', self::failure($http, self::balance(new RequestOptions(maxRetries: -1)))->getMessage());
        self::assertSame('timeout must be a number of seconds, more than 0 and at most 2147483.647.', self::failure($http, self::balance(new RequestOptions(timeout: 0.0)))->getMessage());
        self::assertSame([], $api->requests);
    }

    /** @param array<mixed> $options */
    #[DataProvider('optionsACallDoesntTake')]
    public function test_a_call_s_options_refuse_a_name_or_a_value_the_call_doesn_t_take(array $options, bool $idempotent, string $message): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage($message);
        RequestOptions::from($options, $idempotent);
    }

    /** @return iterable<string, array{array<mixed>, bool, string}> */
    public static function optionsACallDoesntTake(): iterable
    {
        yield 'a misspelt name' => [['timeot' => 5], false, 'Unknown option "timeot": a call takes timeout, max_retries and extra_headers.'];
        yield 'a camelCase name' => [['maxRetries' => 1], true, 'Unknown option "maxRetries": a call takes timeout, max_retries, extra_headers and idempotency_key.'];
        yield 'a key on a call that sends none' => [['idempotency_key' => 'k'], false, 'Unknown option "idempotency_key": a call takes timeout, max_retries and extra_headers.'];
        yield 'a timeout as text' => [['timeout' => '5'], false, 'timeout must be a number of seconds, more than 0 and at most 2147483.647.'];
        yield 'retries as a bool' => [['max_retries' => true], false, 'max_retries must be a whole number, 0 or more.'];
        yield 'headers as text' => [['extra_headers' => 'x-a: b'], false, 'extra_headers must be an array of header names and values.'];
        yield 'a key as a number' => [['idempotency_key' => 42], true, 'idempotency_key must be a string.'];
    }

    public function test_it_waits_what_retry_after_says_instead_of_the_backoff(): void
    {
        $test = new TestHttp(new MockClient(Replies::apiError(429, 'rate_limit_exceeded', ['retry-after' => '3']), Replies::envelope(['id' => 'b'])));
        self::item($test->http, self::balance());
        self::assertSame([3.0], $test->waits);
    }

    public function test_it_reads_a_retry_after_date_as_the_seconds_from_now(): void
    {
        $test = new TestHttp(new MockClient(Replies::apiError(503, 'service_unavailable', ['retry-after' => 'Tue, 29 Sep 2026 10:00:05 GMT']), Replies::envelope(['id' => 'b'])));
        self::item($test->http, self::balance());
        self::assertSame([5.0], $test->waits);
    }

    public function test_it_throws_at_once_rather_than_wait_a_retry_after_of_more_than_a_minute(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable', ['retry-after' => '1800']));
        $test = new TestHttp($api);
        self::assertInstanceOf(InternalServerException::class, self::failure($test->http, self::balance()));
        self::assertCount(1, $api->requests);
        self::assertSame([], $test->waits);
    }

    public function test_a_429_asking_for_more_than_a_minute_throws_at_once_and_reports_the_whole_wait(): void
    {
        $api = new MockClient(Replies::apiError(429, 'rate_limit_exceeded', ['retry-after' => '1800']));
        $test = new TestHttp($api);
        $error = self::failure($test->http, self::balance());
        self::assertInstanceOf(RateLimitException::class, $error);
        self::assertSame(1800.0, $error->retry_after);
        self::assertCount(1, $api->requests);
        self::assertSame([], $test->waits);
    }

    public function test_a_429_without_retry_after_waits_the_backoff_and_reports_retry_after_as_null(): void
    {
        $test = new TestHttp(new MockClient(Replies::apiError(429, 'concurrency_limit_exceeded'), Replies::apiError(429, 'concurrency_limit_exceeded')), maxRetries: 1);
        $error = self::failure($test->http, self::balance());
        self::assertInstanceOf(RateLimitException::class, $error);
        self::assertNull($error->retry_after);
        self::assertSame([0.5], $test->waits);
    }

    /** @param \Closure(): (ResponseInterface|\Throwable) $failure */
    #[DataProvider('retryTable')]
    public function test_a_call_retries_only_what_its_class_allows(RetryClass $retry, \Closure $failure, int $requests): void
    {
        $api = new MockClient($failure(), Replies::envelope(['id' => 'b']));
        try {
            self::item((new TestHttp($api, maxRetries: 1))->http, new APIRequest('GET', '/balance', $retry));
        } catch (NeuronAIException) {
            // The class didn't retry it.
        }
        self::assertCount($requests, $api->requests);
    }

    /** @return iterable<string, array{RetryClass, \Closure(): (ResponseInterface|\Throwable), int}> */
    public static function retryTable(): iterable
    {
        $reset = static fn(): \Throwable => NetworkError::reset();
        $enveloped503 = static fn(): ResponseInterface => Replies::apiError(503, 'service_unavailable');
        $enveloped501 = static fn(): ResponseInterface => Replies::apiError(501, 'server_error');
        $tooMany = static fn(): ResponseInterface => Replies::apiError(429, 'rate_limit_exceeded');
        yield 'safe after a reset' => [RetryClass::Safe, $reset, 2];
        yield 'idempotent after a reset' => [RetryClass::Idempotent, $reset, 2];
        yield 'paid after a reset' => [RetryClass::Paid, $reset, 1];
        yield 'recreate after a reset' => [RetryClass::Recreate, $reset, 1];
        yield 'once after a reset' => [RetryClass::Once, $reset, 1];
        yield 'once after a 503' => [RetryClass::Once, $enveloped503, 1];
        yield 'paid after a 503' => [RetryClass::Paid, $enveloped503, 2];
        yield 'recreate after a 503' => [RetryClass::Recreate, $enveloped503, 2];
        yield 'safe after a 501' => [RetryClass::Safe, $enveloped501, 1];
        yield 'idempotent after a 501' => [RetryClass::Idempotent, $enveloped501, 2];
        yield 'once after a 429' => [RetryClass::Once, $tooMany, 2];
    }

    #[DataProvider('everyClass')]
    public function test_a_connection_never_made_is_retried_by_every_class_even_when_it_timed_out(RetryClass $retry): void
    {
        $transport = new FakeTransport(FakeTransport::refused(), FakeTransport::connectTimeout(), FakeTransport::ok('{"data": {"id": "b"}, "request_id": "r"}'));
        self::assertSame('b', self::item((new TestHttp($transport))->http, new APIRequest('POST', '/embeddings', $retry, body: []))->id);
        self::assertCount(3, $transport->requests);
    }

    /** @return iterable<string, array{RetryClass}> */
    public static function everyClass(): iterable
    {
        foreach (RetryClass::cases() as $retry) {
            yield $retry->value => [$retry];
        }
    }

    public function test_it_doesn_t_retry_a_paid_call_s_bare_5xx_without_the_error_envelope(): void
    {
        $api = new MockClient(new Response(502, ['content-type' => 'text/html'], '<html>502 Bad Gateway</html>'));
        $error = self::failure((new TestHttp($api))->http, new APIRequest('POST', '/embeddings', RetryClass::Paid, body: []));
        self::assertInstanceOf(InternalServerException::class, $error);
        self::assertSame(502, $error->status);
        self::assertCount(1, $api->requests);
    }

    public function test_it_retries_a_paid_call_s_5xx_that_carries_the_error_envelope(): void
    {
        $api = new MockClient(Replies::apiError(500, 'server_error'), Replies::envelope(['id' => 'b']));
        self::assertSame('b', self::item((new TestHttp($api))->http, new APIRequest('POST', '/embeddings', RetryClass::Paid, body: []))->id);
        self::assertCount(2, $api->requests);
    }

    public function test_it_throws_api_timeout_exception_when_a_body_drips_past_the_timeout(): void
    {
        $api = new MockClient(Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true)));
        $error = self::failure((new TestHttp($api, timeout: 0.2, maxRetries: 0))->http, self::balance());
        self::assertSame(APITimeoutException::class, $error::class);
        self::assertSame('Request timed out after 0.2 s.', $error->getMessage());
    }

    public function test_it_times_out_an_error_answer_whose_body_drips(): void
    {
        $api = new MockClient(Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true), 503));
        self::assertInstanceOf(APITimeoutException::class, self::failure((new TestHttp($api, timeout: 0.2, maxRetries: 0))->http, self::balance()));
    }

    public function test_it_uses_a_call_s_timeout_over_the_client_s(): void
    {
        $api = new MockClient(Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true)));
        $error = self::failure((new TestHttp($api, timeout: 60.0, maxRetries: 0))->http, self::balance(new RequestOptions(timeout: 0.2)));
        self::assertSame('Request timed out after 0.2 s.', $error->getMessage());
    }

    public function test_it_retries_a_timeout_on_a_safe_call_but_not_on_a_paid_one(): void
    {
        $safe = new MockClient(Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true)), Replies::envelope(['id' => 'ok']));
        self::assertSame('ok', self::item((new TestHttp($safe, timeout: 0.2))->http, self::balance())->id);
        self::assertCount(2, $safe->requests);
        $paid = new MockClient(Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true)), Replies::envelope(['id' => 'ok']));
        self::assertInstanceOf(APITimeoutException::class, self::failure((new TestHttp($paid, timeout: 0.2))->http, new APIRequest('POST', '/embeddings', RetryClass::Paid, body: [])));
        self::assertCount(1, $paid->requests);
    }

    public function test_it_closes_every_body_it_reads(): void
    {
        $success = new DripStream(['{"data": {"id": "b"}, "request_id": "r"}']);
        $failure = new DripStream(['{}']);
        $http = (new TestHttp(new MockClient(Replies::dripping($success), Replies::dripping($failure, 404))))->http;
        self::item($http, self::balance());
        self::failure($http, self::balance());
        self::assertSame([true, true], [$success->closed, $failure->closed]);
    }

    public function test_a_connection_error_says_what_failed_and_keeps_no_previous_exception(): void
    {
        $error = self::failure((new TestHttp(new MockClient(new NetworkError('', new \RuntimeException('Connection refused'))), maxRetries: 0))->http, self::balance());
        self::assertSame(APIConnectionException::class, $error::class);
        self::assertSame('Connection error: Connection refused', $error->getMessage());
        self::assertNull($error->getPrevious());
    }

    public function test_a_connection_that_drops_while_the_answer_arrives_says_so(): void
    {
        $dropped = new DripStream(['{"data": {'], error: new \RuntimeException('Unable to read from stream'));
        $error = self::failure((new TestHttp(new MockClient(Replies::dripping($dropped)), maxRetries: 0))->http, self::balance());
        self::assertSame('The connection failed while the response arrived: Unable to read from stream', $error->getMessage());
        self::assertTrue($dropped->closed);
    }

    public function test_it_sends_the_caller_s_idempotency_key_the_same_on_every_retry_with_the_same_body(): void
    {
        $api = new MockClient(Replies::apiError(500, 'server_error'), NetworkError::reset(), Replies::envelope(['id' => 'job-1']));
        self::item((new TestHttp($api))->http, self::createJob(new RequestOptions(idempotencyKey: 'order-42')));
        self::assertSame(['order-42', 'order-42', 'order-42'], array_map(static fn(RequestInterface $request): string => $request->getHeaderLine('idempotency-key'), $api->requests));
        self::assertSame(array_fill(0, 3, '{"text":"Salom"}'), array_map(static fn(RequestInterface $request): string => (string) $request->getBody(), $api->requests));
    }

    public function test_it_sends_a_form_as_multipart_with_the_same_bytes_and_key_on_every_retry(): void
    {
        $api = new MockClient(Replies::apiError(500, 'server_error'), NetworkError::reset(), Replies::envelope(['id' => 'v1']));
        $stream = fopen('php://temp', 'w+b');
        self::assertIsResource($stream);
        fwrite($stream, 'RIFF');
        $form = new Form(['name' => 'Office voice', 'ref_audio' => ['stream' => $stream, 'filename' => 'sample.wav'], 'tags' => ['support']], ['ref_audio']);
        self::item((new TestHttp($api))->http, new APIRequest('POST', '/tts/voices', RetryClass::Idempotent, options: new RequestOptions(idempotencyKey: 'voice-1'), form: $form));
        self::assertCount(3, $api->requests);
        [$first] = $api->requests;
        self::assertMatchesRegularExpression('/^multipart\/form-data; boundary=[0-9a-f]{32}$/', $first->getHeaderLine('content-type'));
        self::assertSame(
            ['fields' => ['name' => 'Office voice', 'tags' => ['support']], 'files' => ['ref_audio' => ['filename' => 'sample.wav', 'content_type' => 'audio/wav', 'base64' => base64_encode('RIFF')]]],
            FormParser::parse($first),
        );
        foreach ($api->requests as $sent) {
            self::assertSame([$first->getHeaderLine('content-type'), 'voice-1', (string) $first->getBody()], [$sent->getHeaderLine('content-type'), $sent->getHeaderLine('idempotency-key'), (string) $sent->getBody()]);
        }
    }

    public function test_an_upload_it_can_t_send_is_refused_before_anything_is_sent_with_no_frame_holding_the_key(): void
    {
        $api = new MockClient();
        $stream = fopen('php://temp', 'w+b');
        self::assertIsResource($stream);
        $form = new Form(['file' => $stream, 'language' => 'uz'], ['file']);
        $error = self::failure((new TestHttp($api))->http, new APIRequest('POST', '/stt/transcribe', RetryClass::Idempotent, form: $form));
        self::assertSame("file needs a filename: pass ['stream' => \$stream, 'filename' => 'clip.wav'] rather than the stream alone.", $error->getMessage());
        self::assertSame([], $api->requests);
        self::assertNotSame([], Frames::sdk($error));
        self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
    }

    public function test_the_call_s_key_goes_over_a_client_wide_default_and_extra_headers_over_both(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'b']), Replies::envelope(['id' => 'b']), Replies::envelope(['id' => 'b']));
        $http = (new TestHttp($api, defaultHeaders: ['idempotency-key' => 'shared']))->http;
        self::item($http, self::createJob(new RequestOptions(idempotencyKey: 'order-42')));
        self::item($http, self::createJob());
        self::item($http, self::createJob(new RequestOptions(extraHeaders: ['idempotency-key' => 'extra'], idempotencyKey: 'order-43')));
        [$own, $generated, $over] = array_map(static fn(RequestInterface $request): string => $request->getHeaderLine('idempotency-key'), $api->requests);
        self::assertSame('order-42', $own);
        self::assertMatchesRegularExpression(self::UUID_V4, $generated);
        self::assertSame('extra', $over);
    }

    public function test_it_generates_a_uuid4_when_the_caller_gives_none_and_reuses_it_on_every_retry(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable'), Replies::envelope(['id' => 'b']));
        self::item((new TestHttp($api))->http, self::createJob(new RequestOptions(idempotencyKey: '')));
        [$first, $second] = array_map(static fn(RequestInterface $request): string => $request->getHeaderLine('idempotency-key'), $api->requests);
        self::assertMatchesRegularExpression(self::UUID_V4, $first);
        self::assertSame($first, $second);
    }

    public function test_each_call_gets_its_own_generated_key(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'b']), Replies::envelope(['id' => 'b']));
        $http = (new TestHttp($api))->http;
        self::item($http, self::createJob());
        self::item($http, self::createJob());
        self::assertNotSame($api->requests[0]->getHeaderLine('idempotency-key'), $api->requests[1]->getHeaderLine('idempotency-key'));
    }

    public function test_calls_of_other_classes_send_no_idempotency_key(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'b']), Replies::envelope(['id' => 'b']));
        $http = (new TestHttp($api))->http;
        self::item($http, new APIRequest('POST', '/embeddings', RetryClass::Paid, body: ['text' => 'Salom'], options: new RequestOptions(idempotencyKey: 'ignored')));
        self::item($http, self::balance());
        self::assertSame([false, false], [$api->requests[0]->hasHeader('idempotency-key'), $api->requests[1]->hasHeader('idempotency-key')]);
    }

    public function test_the_api_key_never_appears_in_an_exception_however_it_is_printed(): void
    {
        $replies = [
            NetworkError::reset(),
            Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true)),
            Replies::apiError(401, 'invalid_api_key'),
            Replies::json(200, []),
            new NetworkError('Bad request: Authorization: Bearer ' . TestHttp::KEY),
        ];
        foreach ($replies as $reply) {
            $error = self::failure((new TestHttp(new MockClient($reply), timeout: 0.2, maxRetries: 0))->http, self::balance());
            self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
        }
    }

    public function test_the_api_key_is_redacted_from_a_success_that_isn_t_what_the_call_returns(): void
    {
        $echo = new Response(200, [], '<pre>Authorization: Bearer ' . TestHttp::KEY . '</pre>');
        self::assertSame('OK: <pre>Authorization: Bearer [redacted]</pre>', self::failure((new TestHttp(new MockClient($echo)))->http, self::balance())->getMessage());
    }

    public function test_the_api_key_is_redacted_from_an_error_whose_body_echoes_it_back(): void
    {
        $echo = new Response(502, [], '<pre>Authorization: Bearer ' . TestHttp::KEY . '</pre>');
        $error = self::failure((new TestHttp(new MockClient($echo), maxRetries: 0))->http, self::balance());
        self::assertSame('Bad Gateway: <pre>Authorization: Bearer [redacted]</pre>', $error->getMessage());
    }

    public function test_the_api_key_is_redacted_from_what_an_http_client_reports(): void
    {
        $error = self::failure((new TestHttp(new MockClient(new NetworkError('Bad request: Authorization: Bearer ' . TestHttp::KEY)), maxRetries: 0))->http, self::balance());
        self::assertSame('Connection error: Bad request: Authorization: Bearer [redacted]', $error->getMessage());
    }

    public function test_no_frame_of_the_sdk_that_an_exception_passes_through_holds_the_key(): void
    {
        $replies = [Replies::apiError(404, 'not_found'), NetworkError::reset(), Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true)), Replies::json(200, [])];
        foreach ($replies as $reply) {
            $error = self::failure((new TestHttp(new MockClient($reply), timeout: 0.2, maxRetries: 0))->http, self::balance());
            self::assertNotSame([], Frames::sdk($error));
            foreach (Frames::sdk($error) as $frame) {
                self::assertArrayHasKey('args', $frame, 'The trace records arguments: zend.exception_ignore_args is off.');
                self::assertStringNotContainsString(TestHttp::KEY, print_r($frame['args'], true), $frame['function']);
            }
        }
    }

    public function test_no_exception_frame_or_result_holds_a_key_an_answer_echoes_back(): void
    {
        $echo = ['x-echo' => 'Bearer ' . TestHttp::KEY];
        $page = '<pre>Authorization: Bearer ' . TestHttp::KEY . '</pre>';
        foreach ([new Response(502, $echo, $page), new Response(200, $echo, $page)] as $reply) {
            $error = self::failure((new TestHttp(new MockClient($reply), maxRetries: 0))->http, self::balance());
            self::assertInstanceOf(APIException::class, $error);
            self::assertSame('Bearer [redacted]', $error->headers['x-echo'] ?? null);
            self::assertNotSame([], Frames::sdk($error));
            self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
        }
        $captured = new Captured();
        self::item((new TestHttp(new MockClient(Replies::envelope(['id' => 'b'])->withHeader('x-echo', 'Bearer ' . TestHttp::KEY))))->http->capturingInto($captured), self::balance());
        self::assertSame('Bearer [redacted]', $captured->headers['x-echo'] ?? null);
    }

    #[DataProvider('whereAHeaderIsRefused')]
    public function test_no_frame_of_the_sdk_holds_the_key_when_a_header_is_refused(string $where): void
    {
        $bad = ['x-trace' => "abc\n"];
        $test = new TestHttp(new MockClient(), defaultHeaders: $where === 'default_headers' ? $bad : []);
        $error = self::failure($test->http, self::balance(new RequestOptions(extraHeaders: $where === 'extra_headers' ? $bad : [])));
        self::assertStringContainsString('x-trace', $error->getMessage());
        self::assertNotSame([], Frames::sdk($error));
        self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
    }

    /** @return iterable<string, array{string}> */
    public static function whereAHeaderIsRefused(): iterable
    {
        yield 'default_headers' => ['default_headers'];
        yield 'extra_headers' => ['extra_headers'];
    }

    public function test_a_caller_s_own_authorization_header_goes_on_over_the_sdk_s(): void
    {
        $api = new MockClient(Replies::envelope(['id' => 'b']), Replies::envelope(['id' => 'b']));
        $http = (new TestHttp($api, defaultHeaders: ['Authorization' => 'Bearer from-defaults']))->http;
        self::item($http, self::balance());
        self::item($http, self::balance(new RequestOptions(extraHeaders: ['authorization' => 'Bearer call'])));
        self::assertSame(['Bearer from-defaults', 'Bearer call'], array_map(static fn(RequestInterface $request): string => $request->getHeaderLine('authorization'), $api->requests));
    }

    public function test_the_core_never_shows_the_key_when_dumped(): void
    {
        $http = (new TestHttp(new MockClient()))->http;
        ob_start();
        var_dump($http);
        $dumped = (string) ob_get_clean();
        foreach ([$dumped, print_r($http, true), var_export($http, true)] as $printed) {
            self::assertStringNotContainsString(TestHttp::KEY, $printed);
        }
    }

    private static function balance(RequestOptions $options = new RequestOptions()): APIRequest
    {
        return new APIRequest('GET', '/balance', RetryClass::Safe, options: $options);
    }

    private static function createJob(RequestOptions $options = new RequestOptions()): APIRequest
    {
        return new APIRequest('POST', '/tts/jobs', RetryClass::Idempotent, body: ['text' => 'Salom'], options: $options);
    }

    private static function item(\Naiuz\Core\HttpClient $http, APIRequest $request): Item
    {
        return $http->request($request, Readers::envelope(Item::from(...)));
    }

    private static function failure(\Naiuz\Core\HttpClient $http, APIRequest $request): NeuronAIException
    {
        try {
            self::item($http, $request);
        } catch (NeuronAIException $error) {
            return $error;
        }
        self::fail('The call should have failed.');
    }
}
