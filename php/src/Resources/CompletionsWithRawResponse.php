<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\ChatCompletion;

/**
 * The completions' methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type CreateChatCompletionRequest from Completions
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class CompletionsWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CreateChatCompletionRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<ChatCompletion>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): ChatCompletion => (new Completions($http))->create($params, $options));
    }
}
