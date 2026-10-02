<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\APIRequest;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\InternalServerException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Page;
use Naiuz\Tests\Support\Item;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

final class PageTest extends TestCase
{
    public function test_a_list_call_gives_its_first_page_its_items_cursor_and_request_id(): void
    {
        $first = self::list(new MockClient(self::page(['a', 'b'], 'cursor-2')));
        self::assertSame(['a', 'b'], self::ids($first->data));
        self::assertSame(['cursor-2', 'req-page', true], [$first->next_cursor, $first->request_id, $first->hasNextPage()]);
    }

    public function test_next_page_sends_the_same_query_and_options_with_the_cursor(): void
    {
        $api = new MockClient(self::page(['a', 'b'], 'cursor-2'), self::page(['c'], null, 'req-2'));
        $second = self::list($api)->nextPage();
        self::assertSame(['c'], self::ids($second->data));
        self::assertSame(['req-2', false], [$second->request_id, $second->hasNextPage()]);
        self::assertSame('type=custom&limit=2&cursor=cursor-2', $api->requests[1]->getUri()->getQuery());
        self::assertSame('t1', $api->requests[1]->getHeaderLine('x-trace'));
    }

    public function test_next_page_on_the_last_page_throws_and_sends_nothing(): void
    {
        $api = new MockClient(self::page(['a'], null));
        $last = self::list($api);
        try {
            $last->nextPage();
            self::fail('The last page has no next page.');
        } catch (NeuronAIException $error) {
            self::assertSame('This is the last page: check hasNextPage() before calling nextPage().', $error->getMessage());
        }
        self::assertCount(1, $api->requests);
    }

    public function test_an_empty_cursor_marks_the_last_page(): void
    {
        self::assertFalse(self::list(new MockClient(self::page(['a'], '')))->hasNextPage());
    }

    public function test_foreach_walks_every_item_across_pages(): void
    {
        $api = new MockClient(self::page(['a', 'b'], 'cursor-2'), self::page(['c', 'd'], 'cursor-3'), self::page(['e'], null));
        $ids = [];
        foreach (self::list($api) as $item) {
            $ids[] = $item->id;
        }
        self::assertSame(['a', 'b', 'c', 'd', 'e'], $ids);
        self::assertSame(['', 'cursor-2', 'cursor-3'], array_map(static fn(RequestInterface $request): string => self::cursor($request), $api->requests));
    }

    public function test_iterator_to_array_keeps_every_item_since_the_keys_run_on_across_pages(): void
    {
        $api = new MockClient(self::page(['a', 'b'], 'cursor-2'), self::page(['c'], null));
        self::assertSame(['a', 'b', 'c'], self::ids(iterator_to_array(self::list($api))));
    }

    public function test_a_page_is_fetched_only_when_the_loop_reaches_it(): void
    {
        $api = new MockClient(self::page(['a', 'b'], 'cursor-2'), self::page(['c'], null));
        $items = self::list($api)->getIterator();
        $items->current();
        $items->next();
        $items->current();
        self::assertCount(1, $api);
        $items->next();
        self::assertSame('c', $items->current()->id);
        self::assertCount(2, $api);
    }

    public function test_a_page_that_fails_stops_the_walk_with_its_exception(): void
    {
        $api = new MockClient(self::page(['a'], 'cursor-2'), Replies::apiError(500, 'server_error'));
        $ids = [];
        $thrown = null;
        try {
            foreach (self::list($api, maxRetries: 0) as $item) {
                $ids[] = $item->id;
            }
        } catch (InternalServerException $error) {
            $thrown = $error;
        }
        self::assertSame(['a'], $ids);
        self::assertSame('server_error', $thrown?->error_code);
    }

    public function test_an_answer_without_a_data_list_throws_api_exception(): void
    {
        $this->expectException(APIException::class);
        self::list(new MockClient(Replies::json(200, ['data' => ['id' => 'a'], 'next_cursor' => null, 'request_id' => 'r'])));
    }

    public function test_a_page_gives_back_the_api_s_body_from_to_array_and_json_encode(): void
    {
        $page = self::list(new MockClient(Replies::json(200, ['data' => [['id' => 'a', 'extra' => true]], 'next_cursor' => 'c2', 'request_id' => 'r'])));
        $body = ['data' => [['id' => 'a', 'extra' => true]], 'next_cursor' => 'c2', 'request_id' => 'r'];
        self::assertSame($body, $page->toArray());
        self::assertSame(json_encode($body), json_encode($page));
    }

    /** @return Page<Item> */
    private static function list(MockClient $api, int $maxRetries = 2): Page
    {
        $request = new APIRequest('GET', '/tts/voices', RetryClass::Safe, query: ['type' => 'custom', 'limit' => 2], options: new RequestOptions(extraHeaders: ['x-trace' => 't1']));

        return Page::fetch((new TestHttp($api, maxRetries: $maxRetries))->http, $request, Item::from(...));
    }

    /** @param list<string> $ids */
    private static function page(array $ids, ?string $nextCursor, string $requestId = 'req-page'): ResponseInterface
    {
        $data = array_map(static fn(string $id): array => ['id' => $id], $ids);

        return Replies::json(200, ['data' => $data, 'next_cursor' => $nextCursor, 'request_id' => $requestId], ['x-request-id' => $requestId]);
    }

    /**
     * @param array<Item> $items
     *
     * @return list<string>
     */
    private static function ids(array $items): array
    {
        return array_values(array_map(static fn(Item $item): string => $item->id, $items));
    }

    private static function cursor(RequestInterface $request): string
    {
        parse_str($request->getUri()->getQuery(), $query);
        $cursor = $query['cursor'] ?? '';

        return is_string($cursor) ? $cursor : '';
    }
}
