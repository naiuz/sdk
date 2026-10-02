<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Stream;
use Naiuz\Types\ChatCompletion;
use Naiuz\Types\ChatCompletionChunk;

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
     * With `'stream' => true`, data is the Stream, and the status and headers are those of the answer it reads. data's
     * type is either: check it with instanceof.
     *
     * @param CreateChatCompletionRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<ChatCompletion|Stream<ChatCompletionChunk>>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): ChatCompletion|Stream => (new Completions($http))->create($params, $options));
    }
}
