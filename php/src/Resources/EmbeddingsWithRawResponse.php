<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\EmbeddingResponse;

/**
 * The embeddings' methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type CreateEmbeddingRequest from Embeddings
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class EmbeddingsWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CreateEmbeddingRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<EmbeddingResponse>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): EmbeddingResponse => (new Embeddings($http))->create($params, $options));
    }
}
