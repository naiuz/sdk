<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Types\EmbeddingResponse;

/**
 * Dense vectors for text.
 *
 * @phpstan-type CreateEmbeddingRequest array{model: string, input: string|list<string>, encoding_format?: 'float'|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Embeddings
{
    private const CREATE_EMBEDDING_REQUEST = ['model', 'input', 'encoding_format'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * A 1024-dimensional vector per input, billed per input token.
     *
     * cost is the price, from `X-Cost`. A timeout is never retried, because the call may have been charged.
     *
     * @param CreateEmbeddingRequest $params
     *     - model: the embedding model's id.
     *     - input: the text to embed: one string, or a list of strings for a batch.
     *     - encoding_format: only float vectors are served; base64 is an OpenAI option the API does not support.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): EmbeddingResponse
    {
        $body = Params::check('embeddings->create', $params, self::CREATE_EMBEDDING_REQUEST);
        $request = new APIRequest('POST', '/embeddings', RetryClass::Paid, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::body(EmbeddingResponse::from(...)));
    }
}
