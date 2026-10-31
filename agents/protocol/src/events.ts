// Generated from spec/agents/events.schema.json by scripts/generate.mjs. Do not edit.

/** Every event a client sends. */
export type ClientEvent =
    | ConversationInitiationClientData
    | ClientUserMessage
    | Pong
    | Playback;

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
    | ErrorEvent
    | AgentState
    | UserTranscript
    | AudioPause
    | AudioResume
    | Interruption;

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
    /** The message's id once the server has stored it, as its message_ack gave it; null for a reply not stored yet. */
    message_id: number | null;
    /** For a customer's message sent through a socket, the client_message_id it was sent with; null otherwise. */
    client_message_id: string | null;
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
    /** False asks for a call. Left out, the session is text. */
    text_only?: boolean;
    user_id?: string | null;
    audio?: AudioFormats;
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
    /** The call's audio formats; null for a text session. */
    audio: AudioFormats | null;
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
    code: "refused" | "unavailable" | "invalid" | "rate_limited";
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
    /** Why the turn failed, for the builder's preview: model_timeout, model_unavailable, model_error, egress_blocked, config_invalid, config_unavailable, secret_missing, turn_expired or internal. Null when the turn went through. Treat a code you don't know as internal. */
    error_code: string | null;
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

/** PCM16 little-endian mono at the named sample rate. */
export type AudioFormat = "pcm_16000" | "pcm_24000";

/** A call's audio: the client sends 16 kHz, and gets the output rate it asked for. */
export interface AudioFormats {
    input: "pcm_16000";
    output: AudioFormat;
}

/** How much of a reply's audio has played: every 250 ms while it plays, once when it pauses, and once when its audio ends. */
export interface Playback {
    type: "playback";
    event_id: EventId;
    /** Milliseconds of that reply's audio played since its first frame, pauses excluded. */
    played_ms: number;
}

/** What the agent is doing in a call, which drives the orb. */
export interface AgentState {
    type: "agent_state";
    state: "listening" | "thinking" | "speaking";
}

/** What the customer said in a call, once their turn ended. */
export interface UserTranscript {
    type: "user_transcript";
    text: string;
    language: LanguageCode;
    occurred_at: DateTime;
}

/** The customer started speaking over a reply: pause its playback and keep the buffer. */
export interface AudioPause {
    type: "audio_pause";
    event_id: EventId;
}

/** Nothing to answer was said: resume the paused reply where it stopped. */
export interface AudioResume {
    type: "audio_resume";
    event_id: EventId;
}

/** The customer interrupted: drop the reply's audio, up to and including this response. */
export interface Interruption {
    type: "interruption";
    event_id: EventId;
}

/** Every event type a client sends. */
export const CLIENT_EVENT_TYPES = ["conversation_initiation_client_data", "user_message", "pong", "playback"] as const;

/** Every event type the server sends. */
export const SERVER_EVENT_TYPES = ["conversation_initiation_metadata", "conversation_history", "message_ack", "message_error", "user_message", "agent_typing", "agent_chat_response_part", "agent_response", "agent_response_correction", "operator_message", "handoff", "turn_debug", "ping", "conversation_ended", "error", "agent_state", "user_transcript", "audio_pause", "audio_resume", "interruption"] as const;
