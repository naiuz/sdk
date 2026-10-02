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
use Naiuz\Stream;
use Naiuz\Types\ChatCompletion;
use Naiuz\Types\ChatCompletionChunk;

/**
 * Chat completions.
 *
 * @phpstan-type ChatMessageParam array{role: 'system'|'user'|'assistant'|'tool', content: string}
 * @phpstan-type CreateChatCompletionRequest array{model: string, messages: list<ChatMessageParam>, max_tokens?: int|null, temperature?: float|int|null, top_p?: float|int|null, stop?: string|list<string>|null, stream?: bool|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Completions
{
    /** What a streamed call takes back: the event stream, or an error in the API's JSON envelope. */
    private const EVENT_STREAM = 'text/event-stream, application/json';

    private const CREATE_CHAT_COMPLETION_REQUEST = ['model', 'messages', 'max_tokens', 'temperature', 'top_p', 'stop', 'stream'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * A model's response to a chat conversation, billed per token.
     *
     * Without stream, it returns the ChatCompletion, with cost, the price, from `X-Cost`. A timeout is never retried,
     * because the call may have been charged.
     *
     * With `'stream' => true`, the answer comes as it is generated: the call returns a Stream once the answer starts,
     * and a foreach over it gives each ChatCompletionChunk. The last chunk carries usage when the model reports its token
     * counts. The timeout bounds the wait for each piece of the stream, not the whole of it. A failure once the stream
     * has started comes from the loop as APIException with status 200 and its code, such as `upstream_error`. A stream
     * is billed when it ends, so it has no cost; it is retried like any completion before it starts, and never once it
     * has. Leaving the loop early closes the request: read or close every stream.
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
     *     - stream: true streams the answer as it is generated. Anything but true, false or null throws
     *       NeuronAIException before anything is sent.
     * @param CallOptions $options
     *
     * @return ($params is array{stream: true} ? Stream<ChatCompletionChunk> : ChatCompletion)
     */
    public function create(array $params, array $options = []): ChatCompletion|Stream
    {
        $body = Params::check('chat->completions->create', $params, self::CREATE_CHAT_COMPLETION_REQUEST);
        $stream = $body['stream'] ?? null;
        if ($stream !== null && !is_bool($stream)) {
            throw new NeuronAIException('stream must be true, false or null: it decides whether the answer comes as a stream.');
        }
        $request = new APIRequest('POST', '/chat/completions', RetryClass::Paid, body: $body, accept: $stream ? self::EVENT_STREAM : 'application/json', options: RequestOptions::from($options));

        return $stream ? $this->http->request($request, Readers::stream(ChatCompletionChunk::from(...))) : $this->http->request($request, Readers::body(ChatCompletion::from(...)));
    }
}
