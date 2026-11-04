<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\KnowledgeDocument;
use Naiuz\Types\KnowledgeDocuments;

/**
 * The documents agents answer from: these methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type CreateTextDocumentRequest from KnowledgeBase
 * @phpstan-import-type CreateQaDocumentRequest from KnowledgeBase
 * @phpstan-import-type CreateLinkDocumentRequest from KnowledgeBase
 * @phpstan-import-type CreateFileDocumentRequest from KnowledgeBase
 * @phpstan-import-type UpdateDocumentRequest from KnowledgeBase
 * @phpstan-import-type DeleteDocumentParams from KnowledgeBase
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class KnowledgeBaseWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<KnowledgeDocuments>
     */
    public function list(array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): KnowledgeDocuments => (new KnowledgeBase($http))->list($options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<KnowledgeDocument>
     */
    public function retrieve(int|string $document, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): KnowledgeDocument => (new KnowledgeBase($http))->retrieve($document, $options));
    }

    /**
     * @param CreateTextDocumentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<KnowledgeDocument>
     */
    public function createText(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): KnowledgeDocument => (new KnowledgeBase($http))->createText($params, $options));
    }

    /**
     * @param CreateQaDocumentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<KnowledgeDocument>
     */
    public function createQa(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): KnowledgeDocument => (new KnowledgeBase($http))->createQa($params, $options));
    }

    /**
     * @param CreateLinkDocumentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<KnowledgeDocument>
     */
    public function createLink(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): KnowledgeDocument => (new KnowledgeBase($http))->createLink($params, $options));
    }

    /**
     * @param CreateFileDocumentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<KnowledgeDocument>
     */
    public function createFile(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): KnowledgeDocument => (new KnowledgeBase($http))->createFile($params, $options));
    }

    /**
     * @param UpdateDocumentRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<KnowledgeDocument>
     */
    public function update(int|string $document, array $params = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): KnowledgeDocument => (new KnowledgeBase($http))->update($document, $params, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<null>
     */
    public function refresh(int|string $document, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static function (HttpClient $http) use ($document, $options): null {
            (new KnowledgeBase($http))->refresh($document, $options);

            return null;
        });
    }

    /**
     * @param DeleteDocumentParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<null>
     */
    public function delete(int|string $document, array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static function (HttpClient $http) use ($document, $query, $options): null {
            (new KnowledgeBase($http))->delete($document, $query, $options);

            return null;
        });
    }
}
