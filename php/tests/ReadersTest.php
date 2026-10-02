<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\Answer;
use Naiuz\Core\Attempt;
use Naiuz\Core\Captured;
use Naiuz\Core\Readers;
use Naiuz\Exceptions\APIException;
use Naiuz\RawResponse;
use Naiuz\Tests\Support\Item;
use Naiuz\Tests\Support\Priced;
use PHPUnit\Framework\Attributes\DataProvider;

final class ReadersTest extends TestCase
{
    private const KEY = 'nai_unit_test_key';

    public function test_envelope_gives_data_as_the_object_with_the_request_id(): void
    {
        $item = self::read(Readers::envelope(Item::from(...)), ['data' => ['id' => 'uz-sardor', 'name' => 'Sardor'], 'request_id' => 'req-1']);
        self::assertSame(['uz-sardor', 'Sardor', 'req-1'], [$item->id, $item->name, $item->request_id]);
    }

    public function test_envelope_keeps_fields_the_sdk_doesn_t_know_yet(): void
    {
        $item = self::read(Readers::envelope(Item::from(...)), ['data' => ['id' => 'v1', 'brand_new' => [1, 2]], 'request_id' => 'r']);
        self::assertSame(['id' => 'v1', 'brand_new' => [1, 2]], $item->toArray());
    }

    public function test_envelope_takes_the_request_id_from_x_request_id_then_null(): void
    {
        $data = ['data' => ['id' => 'v1']];
        self::assertSame('req-header', self::read(Readers::envelope(Item::from(...)), $data, ['x-request-id' => 'req-header'])->request_id);
        self::assertNull(self::read(Readers::envelope(Item::from(...)), $data)->request_id);
    }

    public function test_envelope_throws_api_exception_with_the_status_for_a_success_that_isn_t_json(): void
    {
        $error = self::refused(Readers::envelope(Item::from(...)), new Answer(200, 'OK', ['content-type' => 'text/html'], '<html>Sign in to the Wi-Fi</html>'));
        self::assertSame([200, null], [$error->status, $error->error_code]);
        self::assertSame('OK: <html>Sign in to the Wi-Fi</html>', $error->getMessage());
    }

    public function test_envelope_redacts_the_api_key_from_an_answer_it_can_t_use(): void
    {
        $error = self::refused(Readers::envelope(Item::from(...)), new Answer(200, 'OK', [], '<pre>Authorization: Bearer ' . self::KEY . '</pre>'));
        self::assertSame('OK: <pre>Authorization: Bearer [redacted]</pre>', $error->getMessage());
    }

    /** @param array<mixed> $body */
    #[DataProvider('withoutADataObject')]
    public function test_envelope_throws_api_exception_without_a_data_object(array $body): void
    {
        self::assertSame(200, self::refused(Readers::envelope(Item::from(...)), new Answer(200, 'OK', [], json_encode($body, JSON_THROW_ON_ERROR)))->status);
    }

    /** @return iterable<string, array{array<mixed>}> */
    public static function withoutADataObject(): iterable
    {
        yield 'no data' => [['request_id' => 'r']];
        yield 'a list as data' => [['data' => [1], 'request_id' => 'r']];
        yield 'a list as the body' => [[1, 2]];
    }

    public function test_envelope_throws_api_exception_for_data_that_isn_t_the_object_the_call_returns(): void
    {
        $error = self::refused(Readers::envelope(Item::from(...)), new Answer(200, 'OK', [], json_encode(['data' => ['id' => 7, 'token' => self::KEY], 'request_id' => 'r'], JSON_THROW_ON_ERROR)));
        self::assertSame(200, $error->status);
        self::assertStringNotContainsString(self::KEY, $error->getMessage());
        self::assertNull($error->getPrevious());
    }

    public function test_body_gives_the_body_with_the_cost_from_x_cost(): void
    {
        $priced = self::read(Readers::body(Priced::from(...)), ['id' => 'chatcmpl-1'], ['x-cost' => '0.34']);
        self::assertSame(0.34, $priced->cost);
        self::assertSame(['id' => 'chatcmpl-1'], $priced->toArray());
    }

    public function test_body_leaves_the_cost_null_when_x_cost_is_absent_or_not_a_number(): void
    {
        self::assertNull(self::read(Readers::body(Priced::from(...)), ['id' => 'c'])->cost);
        self::assertNull(self::read(Readers::body(Priced::from(...)), ['id' => 'c'], ['x-cost' => 'free'])->cost);
    }

    public function test_page_gives_the_items_the_cursor_and_the_request_id(): void
    {
        $page = self::read(Readers::page(Item::from(...)), ['data' => [['id' => 'a', 'name' => 'A']], 'next_cursor' => 'c2', 'request_id' => 'req-page']);
        self::assertSame([['id' => 'a', 'name' => 'A']], array_map(static fn(Item $item): array => $item->toArray(), $page->items));
        self::assertSame(['c2', 'req-page'], [$page->nextCursor, $page->requestId]);
        self::assertNull($page->items[0]->request_id);
    }

    public function test_page_treats_a_cursor_that_isn_t_a_string_as_the_last_page(): void
    {
        self::assertNull(self::read(Readers::page(Item::from(...)), ['data' => [], 'next_cursor' => 42, 'request_id' => 'r'])->nextCursor);
    }

    /** @param array<mixed> $body */
    #[DataProvider('withoutAListOfObjects')]
    public function test_page_throws_api_exception_without_a_list_of_objects(array $body): void
    {
        self::assertSame(200, self::refused(Readers::page(Item::from(...)), new Answer(200, 'OK', [], json_encode($body, JSON_THROW_ON_ERROR)))->status);
    }

    /** @return iterable<string, array{array<mixed>}> */
    public static function withoutAListOfObjects(): iterable
    {
        yield 'an object as data' => [['data' => ['id' => 'a'], 'request_id' => 'r']];
        yield 'strings as items' => [['data' => ['a'], 'request_id' => 'r']];
        yield 'an item without its id' => [['data' => [['name' => 'A']], 'request_id' => 'r']];
    }

    public function test_nothing_reads_nothing_whatever_the_body(): void
    {
        $this->expectNotToPerformAssertions();
        $read = Readers::nothing();
        $read(new Answer(204, 'No Content', [], ''), self::attempt());
        $read(new Answer(204, 'No Content', [], '<html>'), self::attempt());
    }

    public function test_number_header_reads_a_number_and_gives_null_otherwise(): void
    {
        $headers = ['x-cost' => ' 12.5 ', 'x-blank' => ' ', 'x-word' => 'abc', 'x-huge' => '1e999'];
        self::assertSame(12.5, Readers::numberHeader($headers, 'x-cost'));
        foreach (['x-missing', 'x-blank', 'x-word', 'x-huge'] as $name) {
            self::assertNull(Readers::numberHeader($headers, $name), $name);
        }
    }

    public function test_captured_holds_the_last_answer_it_records(): void
    {
        $captured = new Captured();
        $captured->record(500, ['x-request-id' => 'first']);
        $captured->record(201, ['x-request-id' => 'req-1']);
        self::assertSame([201, ['x-request-id' => 'req-1']], [$captured->status, $captured->headers]);
    }

    public function test_a_raw_response_holds_the_result_the_status_and_the_headers(): void
    {
        $raw = new RawResponse([1], 200, ['x-request-id' => 'r']);
        self::assertSame([[1], 200, 'r'], [$raw->data, $raw->status, $raw->headers['x-request-id']]);
    }

    /**
     * @template T
     *
     * @param \Closure(Answer, Attempt): T $reader
     * @param array<mixed> $body
     * @param array<string, string> $headers
     *
     * @return T
     */
    private static function read(\Closure $reader, array $body, array $headers = []): mixed
    {
        return $reader(new Answer(200, 'OK', $headers, json_encode($body, JSON_THROW_ON_ERROR)), self::attempt());
    }

    /** @param \Closure(Answer, Attempt): mixed $reader */
    private static function refused(\Closure $reader, Answer $answer): APIException
    {
        try {
            $reader($answer, self::attempt());
        } catch (APIException $error) {
            return $error;
        }
        self::fail('The answer should have been refused.');
    }

    private static function attempt(): Attempt
    {
        return new Attempt(1.0, new \SensitiveParameterValue(self::KEY));
    }
}
