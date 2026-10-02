<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\Page;
use Naiuz\RawResponse;
use Naiuz\Types\ApiKey;

/**
 * The API keys' methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type ListApiKeysParams from ApiKeys
 * @phpstan-import-type CreateApiKeyRequest from ApiKeys
 * @phpstan-import-type UpdateApiKeyRequest from ApiKeys
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class ApiKeysWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param ListApiKeysParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<Page<ApiKey>>
     */
    public function list(array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Page => (new ApiKeys($http))->list($query, $options));
    }

    /**
     * @param CreateApiKeyRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<ApiKey>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): ApiKey => (new ApiKeys($http))->create($params, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<ApiKey>
     */
    public function retrieve(string $id, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): ApiKey => (new ApiKeys($http))->retrieve($id, $options));
    }

    /**
     * @param UpdateApiKeyRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<ApiKey>
     */
    public function update(string $id, array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): ApiKey => (new ApiKeys($http))->update($id, $params, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<null>
     */
    public function revoke(string $id, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static function (HttpClient $http) use ($id, $options): null {
            (new ApiKeys($http))->revoke($id, $options);

            return null;
        });
    }
}
