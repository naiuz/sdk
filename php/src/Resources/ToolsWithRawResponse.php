<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\Page;
use Naiuz\RawResponse;
use Naiuz\Types\Tool;

/**
 * The tools agents can use: these methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type SaveToolRequest from Tools
 * @phpstan-import-type DeleteToolParams from Tools
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class ToolsWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<Page<Tool>>
     */
    public function list(array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Page => (new Tools($http))->list($options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<Tool>
     */
    public function retrieve(int|string $tool, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Tool => (new Tools($http))->retrieve($tool, $options));
    }

    /**
     * @param SaveToolRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<Tool>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Tool => (new Tools($http))->create($params, $options));
    }

    /**
     * @param SaveToolRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<Tool>
     */
    public function update(int|string $tool, array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Tool => (new Tools($http))->update($tool, $params, $options));
    }

    /**
     * @param DeleteToolParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<null>
     */
    public function delete(int|string $tool, array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static function (HttpClient $http) use ($tool, $query, $options): null {
            (new Tools($http))->delete($tool, $query, $options);

            return null;
        });
    }
}
