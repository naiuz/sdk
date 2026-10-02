<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\RerankResponse;

/**
 * The rerank's methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type RerankRequest from Rerank
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class RerankWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param RerankRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<RerankResponse>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): RerankResponse => (new Rerank($http))->create($params, $options));
    }
}
