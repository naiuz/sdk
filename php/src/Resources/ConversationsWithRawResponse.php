<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\Page;
use Naiuz\RawResponse;
use Naiuz\Types\Conversation;
use Naiuz\Types\ConversationTranscript;
use Naiuz\Types\SpeechAudio;
use Naiuz\Types\StartedConversation;

/**
 * Your organization's conversations, and carrying one on a channel of your own: these methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type ListConversationsParams from Conversations
 * @phpstan-import-type CreateConversationRequest from Conversations
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class ConversationsWithRawResponse
{
    /** What's said in a conversation. */
    public ConversationMessagesWithRawResponse $messages;

    /** @internal */
    public function __construct(private HttpClient $http)
    {
        $this->messages = new ConversationMessagesWithRawResponse($http);
    }

    /**
     * @param ListConversationsParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<Page<Conversation>>
     */
    public function list(array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Page => (new Conversations($http))->list($query, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<Conversation>
     */
    public function retrieve(string $conversation, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Conversation => (new Conversations($http))->retrieve($conversation, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<ConversationTranscript>
     */
    public function transcript(string $conversation, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): ConversationTranscript => (new Conversations($http))->transcript($conversation, $options));
    }

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<SpeechAudio>
     */
    public function audio(string $conversation, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): SpeechAudio => (new Conversations($http))->audio($conversation, $options));
    }

    /**
     * @param CreateConversationRequest $params
     * @param CallOptions $options
     *
     * @return RawResponse<StartedConversation>
     */
    public function create(array $params, array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): StartedConversation => (new Conversations($http))->create($params, $options));
    }
}
