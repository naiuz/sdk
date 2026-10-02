<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\ModelList;

/**
 * The models' methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class ModelsWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<ModelList>
     */
    public function list(array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): ModelList => (new Models($http))->list($options));
    }
}
