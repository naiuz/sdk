<?php

declare(strict_types=1);

namespace Naiuz;

use Naiuz\Core\HttpClient;
use Naiuz\Resources\AccountWithRawResponse;
use Naiuz\Resources\AgentsWithRawResponse;
use Naiuz\Resources\ApiKeysWithRawResponse;
use Naiuz\Resources\ChatWithRawResponse;
use Naiuz\Resources\ConversationsWithRawResponse;
use Naiuz\Resources\EmbeddingsWithRawResponse;
use Naiuz\Resources\KnowledgeBaseWithRawResponse;
use Naiuz\Resources\ModelsWithRawResponse;
use Naiuz\Resources\RerankWithRawResponse;
use Naiuz\Resources\SttWithRawResponse;
use Naiuz\Resources\ToolsWithRawResponse;
use Naiuz\Resources\TtsWithRawResponse;
use Naiuz\Resources\VoicesWithRawResponse;
use Naiuz\Resources\WebhooksWithRawResponse;

/**
 * The client's resources, each method returning a RawResponse: its result with the status and headers of the answer
 * it came from. A list's gives its first page.
 */
final readonly class NeuronAIWithRawResponse
{
    /** Your organization's balance and usage. */
    public AccountWithRawResponse $account;

    /** Stock voices and your organization's voice clones. */
    public VoicesWithRawResponse $voices;

    /** Text to speech. */
    public TtsWithRawResponse $tts;

    /** Speech to text. */
    public SttWithRawResponse $stt;

    /** Your organization's API keys. */
    public ApiKeysWithRawResponse $apiKeys;

    /** Your organization's agents. */
    public AgentsWithRawResponse $agents;

    /** Your organization's conversations, and carrying one on a channel of your own. */
    public ConversationsWithRawResponse $conversations;

    /** The documents agents answer from. */
    public KnowledgeBaseWithRawResponse $knowledgeBase;

    /** The tools agents can use. */
    public ToolsWithRawResponse $tools;

    /** The addresses that hear of what agents and operators say. */
    public WebhooksWithRawResponse $webhooks;

    /** The chat models available to your account. */
    public ModelsWithRawResponse $models;

    /** Dense vectors for text. */
    public EmbeddingsWithRawResponse $embeddings;

    /** Ranking documents against a query. */
    public RerankWithRawResponse $rerank;

    /** Chat completions. */
    public ChatWithRawResponse $chat;

    /** @internal */
    public function __construct(HttpClient $http)
    {
        $this->account = new AccountWithRawResponse($http);
        $this->voices = new VoicesWithRawResponse($http);
        $this->tts = new TtsWithRawResponse($http);
        $this->stt = new SttWithRawResponse($http);
        $this->apiKeys = new ApiKeysWithRawResponse($http);
        $this->agents = new AgentsWithRawResponse($http);
        $this->conversations = new ConversationsWithRawResponse($http);
        $this->knowledgeBase = new KnowledgeBaseWithRawResponse($http);
        $this->tools = new ToolsWithRawResponse($http);
        $this->webhooks = new WebhooksWithRawResponse($http);
        $this->models = new ModelsWithRawResponse($http);
        $this->embeddings = new EmbeddingsWithRawResponse($http);
        $this->rerank = new RerankWithRawResponse($http);
        $this->chat = new ChatWithRawResponse($http);
    }
}
