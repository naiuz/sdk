<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Core\APIRequest;
use Naiuz\Core\Readers;
use Naiuz\Core\RetryClass;
use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\APITimeoutException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Stream;
use Naiuz\Tests\Support\DripStream;
use Naiuz\Tests\Support\Frames;
use Naiuz\Tests\Support\Item;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\TestHttp;
use PHPUnit\Framework\Attributes\DataProvider;

final class StreamTest extends TestCase
{
    public function test_it_gives_each_chunk_in_order_and_ends_at_done(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n", "data: {\"id\":\"b\"}\n\ndata: [DONE]\n\n"]);
        self::assertSame(['a', 'b'], self::ids(self::stream($body)));
        self::assertSame([true, true], [$body->finished, $body->closed]);
    }

    public function test_events_split_across_pieces_or_sharing_one_read_alike(): void
    {
        $pieces = str_split("data: {\"id\":\"a\"}\r\n\r\ndata: {\"id\":\"b\"}\r\n\r\ndata: [DONE]\r\n\r\n", 5);
        self::assertSame(['a', 'b'], self::ids(self::stream(new DripStream($pieces))));
    }

    public function test_after_done_it_reads_the_rest_of_the_answer_then_closes_it(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\ndata: [DONE]\n\n", ': trailing comment', "\n"]);
        self::assertSame(['a'], self::ids(self::stream($body)));
        self::assertSame([true, true], [$body->finished, $body->closed]);
    }

    public function test_after_done_it_stops_reading_an_answer_that_goes_on_at_the_timeout(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\ndata: [DONE]\n\n"], gap: 0.02, forever: true);
        $started = microtime(true);
        self::assertSame(['a'], self::ids(self::stream($body, timeout: 0.3)));
        self::assertLessThan(1.0, microtime(true) - $started);
        self::assertSame([false, true], [$body->finished, $body->closed]);
    }

    public function test_an_error_event_throws_api_exception_with_status_200_after_the_chunks_before_it(): void
    {
        $event = '{"error":{"type":"server_error","code":"upstream_error","message":"The model failed. Bearer ' . TestHttp::KEY . '","param":null},"request_id":"req-stream"}';
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n", "data: {$event}\n\ndata: [DONE]\n\n"]);
        $ids = [];
        $thrown = null;
        try {
            foreach (self::stream($body) as $item) {
                $ids[] = $item->id;
            }
        } catch (APIException $error) {
            $thrown = $error;
        }
        self::assertSame(['a'], $ids);
        self::assertInstanceOf(APIException::class, $thrown);
        self::assertSame(APIException::class, $thrown::class);
        self::assertSame([200, 'server_error', 'upstream_error', 'The model failed. Bearer [redacted]', 'req-stream'], [$thrown->status, $thrown->type, $thrown->error_code, $thrown->getMessage(), $thrown->request_id]);
        self::assertTrue($body->closed);
    }

    #[DataProvider('eventsThatArentChunks')]
    public function test_an_event_that_isn_t_a_chunk_throws_api_exception_with_status_200(string $event): void
    {
        $this->expectException(APIException::class);
        $this->expectExceptionMessage('OK: ' . $event);
        self::ids(self::stream(new DripStream(["data: {$event}\n\n"])));
    }

    /** @return iterable<string, array{string}> */
    public static function eventsThatArentChunks(): iterable
    {
        yield 'not JSON' => ['<html>'];
        yield 'a list' => ['[1,2]'];
        yield 'an object that isn\'t a chunk' => ['{"name":"no id"}'];
    }

    public function test_a_stream_that_ends_before_done_throws_api_connection_exception(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n", 'data: {"id":"b"']);
        $ids = [];
        $thrown = null;
        try {
            foreach (self::stream($body) as $item) {
                $ids[] = $item->id;
            }
        } catch (APIConnectionException $error) {
            $thrown = $error;
        }
        self::assertSame(['a'], $ids);
        self::assertInstanceOf(APIConnectionException::class, $thrown);
        self::assertSame([APIConnectionException::class, 'The stream ended before [DONE]: the answer may be cut short.'], [$thrown::class, $thrown->getMessage()]);
    }

    public function test_a_connection_that_drops_mid_stream_says_so(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n"], error: new \RuntimeException('Connection reset by peer'));
        $this->expectException(APIConnectionException::class);
        $this->expectExceptionMessage('The connection failed while the response arrived: Connection reset by peer');
        self::ids(self::stream($body));
    }

    public function test_a_read_that_fails_past_the_timeout_throws_api_timeout_exception(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n"], gap: 0.3, error: new \RuntimeException('Unable to read from stream'));
        $this->expectException(APITimeoutException::class);
        $this->expectExceptionMessage('No part of the stream arrived within 0.2 s.');
        self::ids(self::stream($body, timeout: 0.2));
    }

    public function test_reads_that_come_back_empty_for_longer_than_the_timeout_throw_api_timeout_exception(): void
    {
        // A body that never blocks, and has nothing yet each time it is read.
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n", ...array_fill(0, 100, '')], gap: 0.02);
        $started = microtime(true);
        $this->expectException(APITimeoutException::class);
        $this->expectExceptionMessage('No part of the stream arrived within 0.2 s.');
        try {
            self::ids(self::stream($body, timeout: 0.2));
        } finally {
            self::assertLessThan(1.0, microtime(true) - $started);
        }
    }

    public function test_it_can_be_read_once(): void
    {
        $stream = self::stream(new DripStream(["data: {\"id\":\"a\"}\n\ndata: [DONE]\n\n"]));
        self::ids($stream);
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('This stream has already been read: a stream can be read once.');
        self::ids($stream);
    }

    public function test_breaking_out_of_the_loop_closes_the_answer_at_once_while_the_stream_is_kept(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n", "data: {\"id\":\"b\"}\n\n", "data: [DONE]\n\n"]);
        $stream = self::stream($body);
        foreach ($stream as $item) {
            break;
        }
        // $stream still lives: the loop's own generator ended at the break, and closed the answer.
        self::assertSame([true, false], [$body->closed, $body->finished]);
        $stream->close();
    }

    public function test_an_exception_thrown_in_the_loop_closes_the_answer_at_once(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\n", "data: [DONE]\n\n"]);
        $stream = self::stream($body);
        $closed = null;
        try {
            foreach ($stream as $item) {
                throw new \DomainException("The caller's own failure.");
            }
        } catch (\DomainException) {
            $closed = $body->closed;
        }
        // While the exception is caught, $stream still lives: the loop's own generator closed the answer as it unwound.
        self::assertTrue($closed);
    }

    public function test_close_ends_a_loop_quietly_and_a_stream_dropped_unread_closes_its_answer(): void
    {
        $body = new DripStream(["data: {\"id\":\"a\"}\n\ndata: {\"id\":\"b\"}\n\n", "data: [DONE]\n\n"]);
        $stream = self::stream($body);
        $ids = [];
        foreach ($stream as $item) {
            $ids[] = $item->id;
            $stream->close();
        }
        self::assertSame([['a'], true], [$ids, $body->closed]);
        $dropped = new DripStream(["data: [DONE]\n\n"]);
        self::stream($dropped);
        self::assertTrue($dropped->closed);
    }

    public function test_no_frame_of_the_sdk_holds_the_key_when_a_stream_fails(): void
    {
        $echo = 'Bearer ' . TestHttp::KEY;
        $bodies = [
            new DripStream(["data: {\"error\":{\"type\":\"server_error\",\"code\":\"upstream_error\",\"message\":\"{$echo}\",\"param\":null}}\n\n"]),
            new DripStream(["data: {$echo}\n\n"]),
            new DripStream(["data: {\"id\":\"a\"}\n\n"], error: new \RuntimeException("Reset: {$echo}")),
            new DripStream(["data: {\"id\":\"a\"}\n\n"]),
        ];
        foreach ($bodies as $body) {
            try {
                self::ids(self::stream($body));
                self::fail('The stream should have failed.');
            } catch (NeuronAIException $error) {
                self::assertNotSame([], Frames::sdk($error));
                self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
            }
        }
    }

    /**
     * A stream of Items, as the core opens one on a mocked answer whose body is $body.
     *
     * @return Stream<Item>
     */
    private static function stream(DripStream $body, float $timeout = 1.0): Stream
    {
        $answer = new Response(200, ['content-type' => 'text/event-stream', 'x-echo' => 'Bearer ' . TestHttp::KEY], $body);
        $request = new APIRequest('POST', '/chat/completions', RetryClass::Paid, body: ['stream' => true], accept: 'text/event-stream, application/json');

        return (new TestHttp(new MockClient($answer), timeout: $timeout, maxRetries: 0))->http->request($request, Readers::stream(Item::from(...)));
    }

    /**
     * The ids of the stream's items, read to its end.
     *
     * @param Stream<Item> $stream
     *
     * @return list<string>
     */
    private static function ids(Stream $stream): array
    {
        $ids = [];
        foreach ($stream as $item) {
            $ids[] = $item->id;
        }

        return $ids;
    }
}
