<?php

declare(strict_types=1);

namespace Naiuz;

use Naiuz\Core\HttpClient;
use Naiuz\Resources\AccountWithRawResponse;
use Naiuz\Resources\ApiKeysWithRawResponse;
use Naiuz\Resources\ChatWithRawResponse;
use Naiuz\Resources\EmbeddingsWithRawResponse;
use Naiuz\Resources\ModelsWithRawResponse;
use Naiuz\Resources\RerankWithRawResponse;
use Naiuz\Resources\SttWithRawResponse;
use Naiuz\Resources\TtsWithRawResponse;
use Naiuz\Resources\VoicesWithRawResponse;

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
        $this->models = new ModelsWithRawResponse($http);
        $this->embeddings = new EmbeddingsWithRawResponse($http);
        $this->rerank = new RerankWithRawResponse($http);
        $this->chat = new ChatWithRawResponse($http);
    }
}
