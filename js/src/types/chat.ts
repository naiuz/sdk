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
    /** Streaming is not supported by this version of the SDK yet: `true` makes `create()` reject. */
    stream?: boolean | null;
}

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
