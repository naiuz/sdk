<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\InternalServerException;
use Naiuz\Resources\Completions;
use Naiuz\Stream;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Types\ChatCompletionChunk;
use Psr\Http\Message\ResponseInterface;

final class ChatStreamTest extends TestCase
{
    private const HELLO = ['model' => 'gemma-4-26b-a4b', 'messages' => [['role' => 'user', 'content' => 'Salom!']]];

    private const HEAD = '"id":"chatcmpl-1","object":"chat.completion.chunk","created":1790000000,"model":"gemma-4-26b-a4b"';

    private const ROLE = '{' . self::HEAD . ',"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}';

    private const TEXT = '{' . self::HEAD . ',"choices":[{"index":0,"delta":{"content":"Salom!"},"finish_reason":null}]}';

    private const STOP = '{' . self::HEAD . ',"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}';

    private const USAGE = '{' . self::HEAD . ',"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":2,"total_tokens":11}}';

    public function test_stream_true_asks_for_events_and_gives_each_chunk_until_done(): void
    {
        $api = new MockClient(self::events(self::ROLE, self::TEXT, self::STOP, self::USAGE, '[DONE]'));
        $stream = Clients::on($api)->chat->completions->create([...self::HELLO, 'stream' => true]);
        $read = [];
        foreach ($stream as $chunk) {
            $choice = $chunk->choices[0] ?? null;
            $read[] = [$choice?->delta->role, $choice?->delta->content, $choice?->finish_reason, $chunk->usage?->total_tokens];
        }
        self::assertSame([['assistant', null, null, null], [null, 'Salom!', null, null], [null, null, 'stop', null], [null, null, null, 11]], $read);
        [$sent] = $api->requests;
        self::assertSame(['/api/v1/chat/completions', 'text/event-stream, application/json'], [$sent->getRequestTarget(), $sent->getHeaderLine('accept')]);
        self::assertSame('{"model":"gemma-4-26b-a4b","messages":[{"role":"user","content":"Salom!"}],"stream":true}', (string) $sent->getBody());
    }

    public function test_an_error_event_mid_stream_throws_api_exception_with_status_200_and_its_code(): void
    {
        $error = '{"error":{"type":"server_error","code":"upstream_error","message":"The model is temporarily unavailable.","param":null},"request_id":"req-stream"}';
        $stream = Clients::on(new MockClient(self::events(self::ROLE, $error, '[DONE]')))->chat->completions->create([...self::HELLO, 'stream' => true]);
        $chunks = 0;
        $thrown = null;
        try {
            foreach ($stream as $chunk) {
                $chunks++;
            }
        } catch (APIException $caught) {
            $thrown = $caught;
        }
        self::assertSame(1, $chunks);
        self::assertInstanceOf(APIException::class, $thrown);
        self::assertSame([APIException::class, 200, 'upstream_error', 'req-stream'], [$thrown::class, $thrown->status, $thrown->error_code, $thrown->request_id]);
    }

    public function test_a_stream_is_retried_before_it_starts_as_a_paid_call_and_never_once_it_has(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable'), self::events(self::ROLE), new Response(502, [], '<html>Bad Gateway</html>'));
        $completions = new Completions((new TestHttp($api, maxRetries: 2))->http);
        $stream = $completions->create([...self::HELLO, 'stream' => true]);
        try {
            foreach ($stream as $chunk) {
                // The answer is cut short after its first chunk.
            }
            self::fail('The cut-off stream should have been thrown.');
        } catch (APIConnectionException $error) {
            self::assertSame('The stream ended before [DONE]: the answer may be cut short.', $error->getMessage());
        }
        self::assertCount(2, $api->requests);
        try {
            $completions->create([...self::HELLO, 'stream' => true]);
            self::fail('The bare 502 should not have been retried.');
        } catch (InternalServerException $error) {
            self::assertSame([502, null], [$error->status, $error->error_code]);
        }
        self::assertCount(3, $api->requests);
    }

    public function test_a_success_that_isn_t_an_event_stream_throws_api_exception_unretried(): void
    {
        $api = new MockClient(Replies::json(200, ['id' => 'chatcmpl-1']), self::events('[DONE]'));
        try {
            (new Completions((new TestHttp($api))->http))->create([...self::HELLO, 'stream' => true]);
            self::fail('The JSON answer should have been refused.');
        } catch (APIException $error) {
            self::assertSame([200, 'OK: {"id":"chatcmpl-1"}'], [$error->status, $error->getMessage()]);
        }
        self::assertCount(1, $api->requests);
    }

    public function test_with_raw_response_gives_the_stream_with_its_answer_s_status_and_headers(): void
    {
        $raw = Clients::on(new MockClient(self::events(self::TEXT, '[DONE]')))->withRawResponse()->chat->completions->create([...self::HELLO, 'stream' => true]);
        self::assertSame([200, 'req-stream', 'text/event-stream'], [$raw->status, $raw->headers['x-request-id'] ?? null, $raw->headers['content-type'] ?? null]);
        self::assertInstanceOf(Stream::class, $raw->data);
        self::assertSame(['Salom!'], array_map(static fn(ChatCompletionChunk $chunk): ?string => $chunk->choices[0]?->delta->content, iterator_to_array($raw->data)));
    }

    public function test_with_raw_response_redacts_a_key_the_stream_s_answer_echoes_in_its_headers(): void
    {
        $echoing = self::events(self::TEXT, '[DONE]')->withHeader('x-echo', 'Bearer ' . TestHttp::KEY);
        $raw = Clients::on(new MockClient($echoing))->withRawResponse()->chat->completions->create([...self::HELLO, 'stream' => true]);
        self::assertSame('Bearer [redacted]', $raw->headers['x-echo'] ?? null);
        self::assertInstanceOf(Stream::class, $raw->data);
        $raw->data->close();
    }

    public function test_a_chunk_keeps_a_field_the_sdk_doesn_t_know_yet_and_may_leave_out_usage(): void
    {
        $sent = json_decode(self::STOP, flags: JSON_THROW_ON_ERROR);
        self::assertInstanceOf(\stdClass::class, $sent);
        $sent->system_fingerprint = 'fp-1';
        $chunk = ChatCompletionChunk::from($sent);
        self::assertSame(['fp-1', null, 'stop'], [$chunk->toArray()['system_fingerprint'] ?? null, $chunk->usage, $chunk->choices[0]?->finish_reason]);
    }

    private static function events(string ...$data): ResponseInterface
    {
        return new Response(200, ['content-type' => 'text/event-stream', 'x-request-id' => 'req-stream'], implode('', array_map(static fn(string $event): string => "data: {$event}\n\n", $data)));
    }
}
