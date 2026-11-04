<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Page;
use Naiuz\Types\ConversationMessage;
use Naiuz\Types\SentConversationMessage;

/**
 * What's said in a conversation.
 *
 * @phpstan-type CreateConversationMessageRequest array{client_message_id: string, text: string}
 * @phpstan-type ListConversationMessagesParams array{after?: string|int|null, limit?: int|null, cursor?: string|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class ConversationMessages
{
    private const CREATE_CONVERSATION_MESSAGE_REQUEST = ['client_message_id', 'text'];
    private const LIST_CONVERSATION_MESSAGES_PARAMS = ['after', 'limit', 'cursor'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * Stores what the customer said and answers at once, and the agent's reply reaches you by webhook. After the conversation has ended it goes on in the next one, and `conversation_id` says which.
     *
     * @param CreateConversationMessageRequest $params
     *     - client_message_id: Your own id for this message: letters, digits, `_` and `-`, up to 64. Sending it again stores it once.
     *     - text: What the customer said, up to 10,000 characters.
     * @param CallOptions $options
     */
    public function create(string $conversation, array $params, array $options = []): SentConversationMessage
    {
        $body = Params::check('conversationMessages->create', $params, self::CREATE_CONVERSATION_MESSAGE_REQUEST);
        $request = new APIRequest('POST', '/conversations/{conversation}/messages', RetryClass::Safe, ['conversation' => $conversation], body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(SentConversationMessage::from(...)));
    }

    /**
     * What's been said, oldest first, from wherever you got to. Use it to catch up on anything a webhook missed.
     *
     * @param ListConversationMessagesParams $query
     *     - after: The message to read on from.
     *     - limit: How many, from 1 to 100 (50 when left out).
     *     - cursor: A page's `next_cursor`, to start from the page after it.
     * @param CallOptions $options
     *
     * @return Page<ConversationMessage>
     */
    public function list(string $conversation, array $query = [], array $options = []): Page
    {
        $query = Params::check('conversationMessages->list', $query, self::LIST_CONVERSATION_MESSAGES_PARAMS);
        $request = new APIRequest('GET', '/conversations/{conversation}/messages', RetryClass::Safe, ['conversation' => $conversation], query: $query, options: RequestOptions::from($options));

        return Page::fetch($this->http, $request, ConversationMessage::from(...));
    }
}
