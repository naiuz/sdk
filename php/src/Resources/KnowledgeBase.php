<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\Form;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Core\Upload;
use Naiuz\Types\KnowledgeDocument;
use Naiuz\Types\KnowledgeDocuments;

/**
 * The documents agents answer from.
 *
 * @phpstan-type CreateTextDocumentRequest array{name: string, text: string}
 * @phpstan-type CreateQaDocumentRequest array{name: string, pairs: list<array{question: string, answer: string}>}
 * @phpstan-type CreateLinkDocumentRequest array{url: string, crawl_scope?: string|null, name?: string|null}
 * @phpstan-type CreateFileDocumentRequest array{file: Uploadable, name?: string|null}
 * @phpstan-type UpdateDocumentRequest array{name?: string, text?: string, pairs?: list<array{question: string, answer: string}>, crawl_scope?: string}
 * @phpstan-type DeleteDocumentParams array{detach?: bool|null}
 * @phpstan-import-type CallOptions from RequestOptions
 * @phpstan-import-type Uploadable from Upload
 */
readonly class KnowledgeBase
{
    private const CREATE_TEXT_DOCUMENT_REQUEST = ['name', 'text'];
    private const CREATE_QA_DOCUMENT_REQUEST = ['name', 'pairs'];
    private const CREATE_LINK_DOCUMENT_REQUEST = ['url', 'crawl_scope', 'name'];
    private const CREATE_FILE_DOCUMENT_REQUEST = ['file', 'name'];
    private const UPDATE_DOCUMENT_REQUEST = ['name', 'text', 'pairs', 'crawl_scope'];
    private const DELETE_DOCUMENT_PARAMS = ['detach'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Your organization's documents, and how much of its room they use.
     *
     * @param CallOptions $options
     */
    public function list(array $options = []): KnowledgeDocuments
    {
        $request = new APIRequest('GET', '/knowledge-base', RetryClass::Safe, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(KnowledgeDocuments::from(...)));
    }

    /**
     * One document, and how far reading it has got.
     *
     * @param CallOptions $options
     */
    public function retrieve(int|string $document, array $options = []): KnowledgeDocument
    {
        $request = new APIRequest('GET', '/knowledge-base/{document}', RetryClass::Safe, ['document' => (string) $document], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(KnowledgeDocument::from(...)));
    }

    /**
     * Adds text you type in. It's read in the background, and `status` says how far that's got.
     *
     * @param CreateTextDocumentRequest $params
     *     - name: The document's name.
     *     - text: Its text, up to 300,000 characters.
     * @param CallOptions $options
     */
    public function createText(array $params, array $options = []): KnowledgeDocument
    {
        $body = Params::check('knowledgeBase->createText', $params, self::CREATE_TEXT_DOCUMENT_REQUEST);
        $request = new APIRequest('POST', '/knowledge-base/text', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(KnowledgeDocument::from(...)));
    }

    /**
     * Adds pairs of a question and its answer, each found on its own.
     *
     * @param CreateQaDocumentRequest $params
     *     - name: The document's name.
     *     - pairs: Up to 2,000 pairs of `question` and `answer`.
     * @param CallOptions $options
     */
    public function createQa(array $params, array $options = []): KnowledgeDocument
    {
        $body = Params::check('knowledgeBase->createQa', $params, self::CREATE_QA_DOCUMENT_REQUEST);
        $request = new APIRequest('POST', '/knowledge-base/qa', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(KnowledgeDocument::from(...)));
    }

    /**
     * Adds a website or a Google file by its address, which is read again every week.
     *
     * @param CreateLinkDocumentRequest $params
     *     - url: An https address.
     *     - crawl_scope: How far to read a website: this `page`, or the whole `site`.
     *     - name: The document's name, up to 255 characters. The address's host when left out.
     * @param CallOptions $options
     */
    public function createLink(array $params, array $options = []): KnowledgeDocument
    {
        $body = Params::check('knowledgeBase->createLink', $params, self::CREATE_LINK_DOCUMENT_REQUEST);
        $request = new APIRequest('POST', '/knowledge-base/link', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(KnowledgeDocument::from(...)));
    }

    /**
     * Adds a file, sent as multipart/form-data.
     *
     * @param CreateFileDocumentRequest $params
     *     - file: A PDF, a Word document, a spreadsheet or a text file.
     *     - name: The document's name, up to 255 characters. The file's when left out.
     * @param CallOptions $options
     */
    public function createFile(array $params, array $options = []): KnowledgeDocument
    {
        $fields = Params::check('knowledgeBase->createFile', $params, self::CREATE_FILE_DOCUMENT_REQUEST);
        $request = new APIRequest('POST', '/knowledge-base/file', RetryClass::Once, options: RequestOptions::from($options), form: new Form($fields, ['file']));

        return $this->http->request($request, Readers::envelope(KnowledgeDocument::from(...)));
    }

    /**
     * Changes the name, or what each kind holds. What changes the content is read again.
     *
     * @param UpdateDocumentRequest $params
     *     - name: The document's name.
     *     - text: A text document's text.
     *     - pairs: A questions document's pairs.
     *     - crawl_scope: How far to read a website: this `page`, or the whole `site`.
     * @param CallOptions $options
     */
    public function update(int|string $document, array $params = [], array $options = []): KnowledgeDocument
    {
        $body = Params::check('knowledgeBase->update', $params, self::UPDATE_DOCUMENT_REQUEST);
        $request = new APIRequest('PUT', '/knowledge-base/{document}', RetryClass::Safe, ['document' => (string) $document], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(KnowledgeDocument::from(...)));
    }

    /**
     * Reads a link document again now, or tries a file that failed again.
     *
     * @param CallOptions $options
     */
    public function refresh(int|string $document, array $options = []): void
    {
        $request = new APIRequest('POST', '/knowledge-base/{document}/refresh', RetryClass::Safe, ['document' => (string) $document], options: RequestOptions::from($options));

        $this->http->request($request, Readers::nothing());
    }

    /**
     * Deletes a document.
     *
     * @param DeleteDocumentParams $query
     *     - detach: Take it off the agents that use it. Without this, one in use raises a conflict naming them.
     * @param CallOptions $options
     */
    public function delete(int|string $document, array $query = [], array $options = []): void
    {
        $query = Params::check('knowledgeBase->delete', $query, self::DELETE_DOCUMENT_PARAMS);
        $request = new APIRequest('DELETE', '/knowledge-base/{document}', RetryClass::Safe, ['document' => (string) $document], query: $query, options: RequestOptions::from($options));

        $this->http->request($request, Readers::nothing());
    }
}
