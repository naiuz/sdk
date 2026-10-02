<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Types\RerankResponse;

/**
 * Ranking documents against a query.
 *
 * @phpstan-type RerankRequest array{model: string, query: string, documents: list<string>, top_n?: int|null, return_documents?: bool|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Rerank
{
    private const RERANK_REQUEST = ['model', 'query', 'documents', 'top_n', 'return_documents'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Scores each document against the query, and returns them by relevance, highest first.
     *
     * Billed per token across the query and all documents. cost is the price, from `X-Cost`. A timeout is never
     * retried, because the call may have been charged.
     *
     * @param RerankRequest $params
     *     - model: the rerank model's id.
     *     - query: the query to rank the documents against.
     *     - documents: the documents, at least one.
     *     - top_n: how many of the best documents to return, 1 or more.
     *     - return_documents: false leaves out each result's document.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): RerankResponse
    {
        $body = Params::check('rerank->create', $params, self::RERANK_REQUEST);
        $request = new APIRequest('POST', '/rerank', RetryClass::Paid, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::body(RerankResponse::from(...)));
    }
}
