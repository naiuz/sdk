/** Who says a message. */
export type ChatRole = "system" | "user" | "assistant" | "tool" | (string & {});

/** One message of the conversation. */
export interface ChatMessage {
    /** `system`, `user`, `assistant` or `tool`. */
    role: ChatRole;
    /** The message's text, as one string. A list of content parts, as OpenAI also takes, is refused. */
    content: string;
}

/** A chat completion request. */
export interface CreateChatCompletionRequest {
    /** The model's id, from `models.list()`. */
    model: string;
    /** The conversation so far, at least one message. */
    messages: ChatMessage[];
    /** The most tokens to generate, 1 or more. */
    max_tokens?: number | null;
    /** From 0 to 2. */
    temperature?: number | null;
    /** From 0 to 1. */
    top_p?: number | null;
    /**
     * Text at which the model stops: one string, or a list of strings
     * (OpenAI's `stop`). Sent to the model exactly as given, byte for byte,
     * including a string of only whitespace such as `\n`.
     */
    stop?: string | string[] | null;
    /** `true` streams the answer as it is generated: `create()` then resolves to a Stream of ChatCompletionChunk, not a ChatCompletion. */
    stream?: boolean | null;
}

/** A chat completion request that streams the answer. */
export type CreateChatCompletionRequestStreaming = CreateChatCompletionRequest & {stream: true};

/** A chat completion request that doesn't stream the answer. */
export type CreateChatCompletionRequestNonStreaming = CreateChatCompletionRequest & {stream?: false | null};

/** The assistant's message. */
export interface ChatCompletionMessage {
    /** Always `assistant`. */
    role: "assistant" | (string & {});
    /** The answer's text. */
    content: string;
}

/** One choice of the completion. */
export interface ChatCompletionChoice {
    /** The choice's position, from 0. */
    index: number;
    /** The assistant's message. */
    message: ChatCompletionMessage;
    /** Why generation stopped, such as `stop`. */
    finish_reason: string;
}

/** The tokens billed. */
export interface ChatCompletionUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

/** The completion: one choice holding the assistant's message, and `usage` counting the tokens billed. */
export interface ChatCompletion {
    /** The completion's id. */
    id: string;
    /** Always `chat.completion`. */
    object: "chat.completion" | (string & {});
    /** When the completion was created, in Unix seconds. */
    created: number;
    /** The model's id. */
    model: string;
    /** The choices: one. */
    choices: ChatCompletionChoice[];
    /** The tokens billed. */
    usage: ChatCompletionUsage;
}

/** The piece of the assistant's message a chunk carries. */
export interface ChatCompletionChunkDelta {
    /** `assistant`, on the stream's first chunk only. */
    role?: "assistant" | (string & {});
    /** The next piece of the answer's text. */
    content?: string;
}

/** A chunk's choice: the next piece of the assistant's message. */
export interface ChatCompletionChunkChoice {
    /** The choice's position, from 0. */
    index: number;
    /** The next piece of the message: the role on the first chunk, then the text piece by piece. The chunk that ends the answer may leave it empty. */
    delta: ChatCompletionChunkDelta;
    /** `null` until the chunk that ends the answer, which names why it stopped, such as `stop`. */
    finish_reason: string | null;
}

/**
 * One event of a streamed chat completion (`stream: true`). The API document
 * describes these chunks in prose, not as a schema, so this type follows
 * that prose and the contract fixture: first a chunk whose delta holds the
 * role, then one for each piece of the answer, the last of them naming the
 * finish reason, and then, when the model reports its token counts, a chunk
 * with no choices and `usage`. Every chunk repeats the same `id`, `created`
 * and `model`.
 */
export interface ChatCompletionChunk {
    /** The completion's id, the same on every chunk. */
    id: string;
    /** Always `chat.completion.chunk`. */
    object: "chat.completion.chunk" | (string & {});
    /** When the completion was created, in Unix seconds. */
    created: number;
    /** The model's id. */
    model: string;
    /** One choice holding the next piece of the message; empty on the final usage chunk. */
    choices: ChatCompletionChunkChoice[];
    /** The tokens billed: on the last chunk only, and only when the model reports its token counts. */
    usage?: ChatCompletionUsage;
}
