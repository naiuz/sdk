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
use Naiuz\Types\Conversation;
use Naiuz\Types\ConversationTranscript;
use Naiuz\Types\SpeechAudio;
use Naiuz\Types\StartedConversation;

/**
 * Your organization's conversations, and carrying one on a channel of your own.
 *
 * @phpstan-type ListConversationsParams array{agent_id?: string|null, status?: string|null, limit?: int|null, cursor?: string|null}
 * @phpstan-type CreateConversationRequest array{agent_id: string, contact?: array{external_id?: string, name?: string, phone?: string}, variables?: array<string, string|int|float|bool>}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Conversations
{
    private const LIST_CONVERSATIONS_PARAMS = ['agent_id', 'status', 'limit', 'cursor'];
    private const CREATE_CONVERSATION_REQUEST = ['agent_id', 'contact', 'variables'];

    /** What a recording call accepts: the audio, or an error in the API's JSON envelope. */
    private const AUDIO = 'audio/ogg, application/json';

    /** What's said in a conversation. */
    public ConversationMessages $messages;

    /** @internal */
    public function __construct(private HttpClient $http)
    {
        $this->messages = new ConversationMessages($http);
    }

    /**
     * Your organization's conversations from every channel, newest first. Loop over the result for every one, each page fetched when the loop reaches it.
     *
     * @param ListConversationsParams $query
     *     - agent_id: Only this agent's.
     *     - status: Only those in this status, such as `resolved`.
     *     - limit: How many, from 1 to 100 (50 when left out).
     *     - cursor: A page's `next_cursor`, to start from the page after it.
     * @param CallOptions $options
     *
     * @return Page<Conversation>
     */
    public function list(array $query = [], array $options = []): Page
    {
        $query = Params::check('conversations->list', $query, self::LIST_CONVERSATIONS_PARAMS);
        $request = new APIRequest('GET', '/conversations', RetryClass::Safe, query: $query, options: RequestOptions::from($options));

        return Page::fetch($this->http, $request, Conversation::from(...));
    }

    /**
     * One conversation, with its variables, summary and cost, and whether it has audio.
     *
     * @param CallOptions $options
     */
    public function retrieve(string $conversation, array $options = []): Conversation
    {
        $request = new APIRequest('GET', '/conversations/{conversation}', RetryClass::Safe, ['conversation' => $conversation], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Conversation::from(...)));
    }

    /**
     * What the customer, the agent and operators said, all in one answer.
     *
     * @param CallOptions $options
     */
    public function transcript(string $conversation, array $options = []): ConversationTranscript
    {
        $request = new APIRequest('GET', '/conversations/{conversation}/transcript', RetryClass::Safe, ['conversation' => $conversation], options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(ConversationTranscript::from(...)));
    }

    /**
     * The recording of a call, as Ogg Opus. No recording, or one past its time, raises NotFound.
     *
     * @param CallOptions $options
     */
    public function audio(string $conversation, array $options = []): SpeechAudio
    {
        $request = new APIRequest('GET', '/conversations/{conversation}/audio', RetryClass::Safe, ['conversation' => $conversation], accept: self::AUDIO, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::speech());
    }

    /**
     * A conversation on a channel of your own. Nothing is sent until the customer says something, and then the agent's first message and its answer reach you by webhook.
     *
     * @param CreateConversationRequest $params
     *     - agent_id: The agent that answers.
     *     - contact: Who it's with.
     *     - variables: Values for the agent's `{{variables}}`.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): StartedConversation
    {
        $body = Params::check('conversations->create', $params, self::CREATE_CONVERSATION_REQUEST);
        $request = new APIRequest('POST', '/conversations', RetryClass::Once, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(StartedConversation::from(...)));
    }
}
