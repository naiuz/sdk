<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\Page;
use Naiuz\RawResponse;
use Naiuz\Types\ConversationMessage;
use Naiuz\Types\SentConversationMessage;

/**
 * What's said in a conversation: these methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type CreateConversationMessageRequest from ConversationMessages
 * @phpstan-import-type ListConversationMessagesParams from ConversationMessages
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class ConversationMessagesWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CreateConversationMessageRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<SentConversationMessage>
     */
    public function create(string $conversation, array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): SentConversationMessage => (new ConversationMessages($http))->create($conversation, $params, $options));
    }

    /**
     * @param ListConversationMessagesParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<Page<ConversationMessage>>
     */
    public function list(string $conversation, array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Page => (new ConversationMessages($http))->list($conversation, $query, $options));
    }
}
