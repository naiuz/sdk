<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Types\ChatCompletion;

/**
 * Chat completions.
 *
 * @phpstan-type ChatMessageParam array{role: 'system'|'user'|'assistant'|'tool', content: string}
 * @phpstan-type CreateChatCompletionRequest array{model: string, messages: list<ChatMessageParam>, max_tokens?: int|null, temperature?: float|int|null, top_p?: float|int|null, stop?: string|list<string>|null, stream?: false|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Completions
{
    private const CREATE_CHAT_COMPLETION_REQUEST = ['model', 'messages', 'max_tokens', 'temperature', 'top_p', 'stop', 'stream'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * A model's response to a chat conversation, billed per token.
     *
     * cost is the price, from `X-Cost`. A timeout is never retried, because the call may have been charged.
     *
     * @param CreateChatCompletionRequest $params
     *     - model: the model's id, from models->list().
     *     - messages: the conversation so far, at least one message, each a role (`system`, `user`, `assistant` or
     *       `tool`) and its content, as one string.
     *     - max_tokens: the most tokens to generate, 1 or more.
     *     - temperature: from 0 to 2.
     *     - top_p: from 0 to 1.
     *     - stop: text at which the model stops: one string, or a list of strings. Sent exactly as given, byte for
     *       byte, including a string of only whitespace such as a line break.
     *     - stream: streamed answers arrive in a later version of this SDK; true throws NeuronAIException before
     *       anything is sent.
     * @param CallOptions $options
     */
    public function create(array $params, array $options = []): ChatCompletion
    {
        $body = Params::check('chat->completions->create', $params, self::CREATE_CHAT_COMPLETION_REQUEST);
        if (($body['stream'] ?? null) !== null && $body['stream'] !== false) {
            throw new NeuronAIException('Streamed chat completions arrive in a later version of this SDK: leave stream out.');
        }
        $request = new APIRequest('POST', '/chat/completions', RetryClass::Paid, body: $body, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::body(ChatCompletion::from(...)));
    }
}
