<?php

declare(strict_types=1);

namespace Naiuz;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Readers;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Types\ApiObject;

/**
 * One page of a list. Loop over it with foreach for its items and every page's after it, each page fetched when the
 * loop reaches it.
 *
 * @template-covariant T of ApiObject
 *
 * @implements \IteratorAggregate<int, T>
 */
final readonly class Page implements \IteratorAggregate, \JsonSerializable
{
    /**
     * @param list<T> $data This page's items.
     * @param string|null $next_cursor Pass it as `cursor` for the next page; null on the last page. Cursors are
     *     opaque: don't build or change them.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id`, else its
     *     `X-Request-Id` header.
     * @param \Closure(\stdClass): T $make
     */
    private function __construct(
        public array $data,
        public ?string $next_cursor,
        public ?string $request_id,
        private HttpClient $http,
        private APIRequest $request,
        private \Closure $make,
    ) {}

    /**
     * Sends a list call, and returns its page.
     *
     * @internal
     *
     * @template M of ApiObject
     *
     * @param \Closure(\stdClass): M $make
     *
     * @return self<M>
     */
    public static function fetch(HttpClient $http, APIRequest $request, \Closure $make): self
    {
        $page = $http->request($request, Readers::page($make));

        return new self($page->items, $page->nextCursor, $page->requestId, $http, $request, $make);
    }

    /** Whether another page follows this one. */
    public function hasNextPage(): bool
    {
        return $this->next_cursor !== null && $this->next_cursor !== '';
    }

    /**
     * The page after this one, with the same query and options. On the last page it throws NeuronAIException.
     *
     * @return self<T>
     */
    public function nextPage(): self
    {
        if ($this->next_cursor === null || $this->next_cursor === '') {
            throw new NeuronAIException('This is the last page: check hasNextPage() before calling nextPage().');
        }

        return self::fetch($this->http, $this->request->withQuery(['cursor' => $this->next_cursor]), $this->make);
    }

    /**
     * Every item of this page and of the pages after it, each page fetched when the loop reaches it.
     *
     * @return \Generator<int, T, mixed, void>
     */
    public function getIterator(): \Generator
    {
        $page = $this;
        while (true) {
            foreach ($page->data as $item) {
                yield $item;
            }
            if (!$page->hasNextPage()) {
                return;
            }
            $page = $page->nextPage();
        }
    }

    /**
     * The page as the API sent it, as arrays: its items, its cursor and the request's ID.
     *
     * @return array{data: list<array<string, mixed>>, next_cursor: string|null, request_id: string|null}
     */
    public function toArray(): array
    {
        return [
            'data' => array_map(static fn(ApiObject $item): array => $item->toArray(), $this->data),
            'next_cursor' => $this->next_cursor,
            'request_id' => $this->request_id,
        ];
    }

    /**
     * The page exactly as the API sent it, for json_encode().
     *
     * @return array{data: list<T>, next_cursor: string|null, request_id: string|null}
     */
    public function jsonSerialize(): array
    {
        return ['data' => $this->data, 'next_cursor' => $this->next_cursor, 'request_id' => $this->request_id];
    }
}
