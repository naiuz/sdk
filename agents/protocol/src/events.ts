// Generated from spec/agents/events.schema.json by scripts/generate.mjs. Do not edit.

/** Every event a client sends. */
export type ClientEvent =
    | ConversationInitiationClientData
    | ClientUserMessage
    | Pong;

/** Every event the server sends. */
export type ServerEvent =
    | ConversationInitiationMetadata
    | ConversationHistory
    | MessageAck
    | MessageError
    | ServerUserMessage
    | AgentTyping
    | AgentChatResponsePart
    | AgentResponse
    | AgentResponseCorrection
    | OperatorMessage
    | Handoff
    | TurnDebug
    | Ping
    | ConversationEnded
    | ErrorEvent;

/** A language the platform speaks. */
export type LanguageCode = "uz" | "ru" | "en";

export type ConversationId = string;

/** The client's own id for a message, the same on every retry. */
export type ClientMessageId = string;

export type MessageId = number;

/** Counts up per conversation, across turns. */
export type EventId = number;

export type DateTime = string;

export interface Overrides {
    first_message?: string;
    language?: LanguageCode;
}

export interface Features {
    text: boolean;
    voice: boolean;
    debug: boolean;
}

export interface HistoryMessage {
    role: "customer" | "agent" | "operator";
    text: string;
    at: DateTime;
}

export interface TextResponsePart {
    type: "start" | "delta" | "stop";
    text: string;
}

export interface Operator {
    name: string | null;
    avatar_url: string | null;
}

export interface TurnTimings {
    queue_ms: number | null;
    first_token_ms: number | null;
    model_ms: number | null;
    stt_ms: number | null;
    tts_first_chunk_ms: number | null;
    total_ms: number;
}

export interface UsageItem {
    service: "llm" | "stt" | "tts_v3";
    model: string;
    source: "neuronai" | "external" | "custom";
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    audio_seconds: number;
    characters: number;
    /** OpenRouter's reported cost, as a decimal string. */
    cost_usd: string | null;
    estimated: boolean;
}

/** The client's half of the handshake, its first frame. */
export interface ConversationInitiationClientData {
    type: "conversation_initiation_client_data";
    /** Values for the agent's variables. Signed values in the token win. */
    dynamic_variables?: Record<string, string | number | boolean>;
    overrides?: Overrides;
    text_only?: boolean;
    user_id?: string | null;
}

/** A message the user typed. */
export interface ClientUserMessage {
    type: "user_message";
    client_message_id: ClientMessageId;
    text: string;
}

/** The answer to a ping. */
export interface Pong {
    type: "pong";
    event_id: EventId;
}

/** The server's half of the handshake. */
export interface ConversationInitiationMetadata {
    type: "conversation_initiation_metadata";
    conversation_id: ConversationId;
    /** Reconnects to this conversation. Keep only the newest. */
    resume_token: string;
    status: "new" | "ai_handling" | "human_handling" | "resolved" | "reopened" | "in_call";
    languages: LanguageCode[];
    language: LanguageCode;
    features: Features;
}

/** On a resume: the messages so far, oldest first. */
export interface ConversationHistory {
    type: "conversation_history";
    messages: HistoryMessage[];
}

/** The message is saved. */
export interface MessageAck {
    type: "message_ack";
    client_message_id: ClientMessageId;
    message_id: MessageId;
    occurred_at: DateTime;
}

/** The message wasn't saved. Send it again if retryable. */
export interface MessageError {
    type: "message_error";
    client_message_id: ClientMessageId;
    retryable: boolean;
    code: "refused" | "unavailable" | "invalid";
}

/** A message another viewer of the conversation sent. */
export interface ServerUserMessage {
    type: "user_message";
    client_message_id: ClientMessageId;
    message_id: MessageId;
    text: string;
    occurred_at: DateTime;
}

/** Shown before a text reply. */
export interface AgentTyping {
    type: "agent_typing";
}

/** One piece of a streamed reply. */
export interface AgentChatResponsePart {
    type: "agent_chat_response_part";
    event_id: EventId;
    text_response_part: TextResponsePart;
}

/** The final text of a reply. */
export interface AgentResponse {
    type: "agent_response";
    event_id: EventId;
    text: string;
}

/** Replaces what the client has of a reply; an empty text withdraws it. */
export interface AgentResponseCorrection {
    type: "agent_response_correction";
    event_id: EventId;
    text: string;
}

/** An operator's reply. */
export interface OperatorMessage {
    type: "operator_message";
    event_id: EventId;
    text: string;
    operator: Operator;
}

/** The conversation passed to operators; the agent stays silent. */
export interface Handoff {
    type: "handoff";
    reason: "agent" | "agent_failed" | "balance";
    mode_outcome: "continue_as_text";
}

/** For testers only (caps.debug): how a turn ran. */
export interface TurnDebug {
    type: "turn_debug";
    event_id: EventId;
    turn_id: string;
    step: string | null;
    model: string | null;
    fallback_used: boolean;
    timings: TurnTimings;
    usage: UsageItem[];
    warnings: string[];
}

/** Answer with a pong carrying the same event id. */
export interface Ping {
    type: "ping";
    event_id: EventId;
}

/** The conversation ended; the server closes with 1000. */
export interface ConversationEnded {
    type: "conversation_ended";
    reason: string;
}

/** A frame the server couldn't use. The socket stays open. */
export interface ErrorEvent {
    type: "error";
    code: "unknown_event" | "invalid_event" | "internal";
    message: string;
}

/** Every event type a client sends. */
export const CLIENT_EVENT_TYPES = ["conversation_initiation_client_data", "user_message", "pong"] as const;

/** Every event type the server sends. */
export const SERVER_EVENT_TYPES = ["conversation_initiation_metadata", "conversation_history", "message_ack", "message_error", "user_message", "agent_typing", "agent_chat_response_part", "agent_response", "agent_response_correction", "operator_message", "handoff", "turn_debug", "ping", "conversation_ended", "error"] as const;
