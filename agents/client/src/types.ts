import type {AudioFormat, ConversationInitiationMetadata, HistoryMessage, LanguageCode, Operator, TurnDebug} from "@naiuz/agents-protocol";
import type {AudioIO} from "./audio/io";

export type Status = "connecting" | "connected" | "reconnecting" | "disconnected";

/** Who is handling the conversation, as each metadata says: the AI, an operator, or a call, for example. */
export type ConversationStatus = ConversationInitiationMetadata["status"];

/** A text session's mode is text. A call's is the agent's state: listening, thinking or speaking. */
export type Mode = "text" | "listening" | "thinking" | "speaking";

/** The part of the browser's WebSocket the client uses, so tests and other runtimes can supply their own. */
export interface WebSocketLike {
    readonly readyState: number;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: {data: unknown}) => void) | null;
    onclose: ((event: {code: number; reason: string}) => void) | null;
    onerror: ((event: unknown) => void) | null;
    /** A call's audio goes out as binary frames, and comes in as ArrayBuffers once this is "arraybuffer". */
    binaryType?: string;
    /** The bytes queued and not yet sent, so a call can drop audio after a stall rather than flood the socket. */
    readonly bufferedAmount?: number;
    send(data: string | Uint8Array): void;
    close(code?: number, reason?: string): void;
}

export type WebSocketFactory = new (url: string) => WebSocketLike;

/** A message the server has saved. */
export interface MessageAck {
    clientMessageId: string;
    messageId: number;
    occurredAt: string;
}

export interface SendOptions {
    /** The id to send the message with. Pass a failed message's clientMessageId to send it again without a duplicate. */
    clientMessageId?: string;
}

/** A message for the transcript: the agent's reply, an operator's, another viewer's, or what the customer said in a call. */
export type IncomingMessage =
    | {source: "ai"; message: string; eventId: number}
    | {source: "operator"; message: string; eventId: number; operator: Operator}
    | {source: "user"; message: string; messageId: number; spoken?: false}
    | {source: "user"; message: string; spoken: true; language: LanguageCode; occurredAt: string};

export interface DisconnectDetails {
    /** Who ended it: the app with endSession(), the server, or an error the client couldn't get past. */
    reason: "user" | "server" | "error";
    code?: number;
    message?: string;
}

/** One of the page's client tools: the agent's values in, what the agent should read back out, or a Promise of it. */
export type ClientToolHandler = (parameters: Record<string, unknown>) => unknown;

/** A call to a client tool this page has no handler for. */
export interface UnhandledClientToolCall {
    toolCallId: string;
    toolName: string;
    parameters: Record<string, unknown>;
    expectsResponse: boolean;
}

export interface Callbacks {
    onConnect?: (details: {conversationId: string; status: ConversationStatus}) => void;
    /**
     * The conversation's status from the first metadata, then from any reconnect's that changes it: an operator who
     * took over while the connection was down, for example.
     */
    onConversationStatus?: (change: {status: ConversationStatus}) => void;
    onDisconnect?: (details: DisconnectDetails) => void;
    onStatusChange?: (change: {status: Status}) => void;
    onModeChange?: (change: {mode: Mode}) => void;
    onMessage?: (message: IncomingMessage) => void;
    onAgentChatResponsePart?: (part: {eventId: number; type: "start" | "delta" | "stop"; text: string}) => void;
    onAgentResponseCorrection?: (correction: {eventId: number; text: string}) => void;
    onAgentTyping?: () => void;
    onHistory?: (messages: HistoryMessage[]) => void;
    onHandoff?: (handoff: {reason: "agent" | "agent_failed" | "balance"}) => void;
    onDebug?: (event: TurnDebug) => void;
    /** The agent called a client tool this page has no handler for. A call that expects a response is answered with an error. */
    onUnhandledClientToolCall?: (call: UnhandledClientToolCall) => void;
    onError?: (message: string, context: {code: string}) => void;
}

/** What a session may change about its agent, each only when the agent allows it. */
export interface SessionOverrides {
    /** The agent's prompt for this session, in place of its own. */
    prompt?: string;
    firstMessage?: string;
    language?: LanguageCode;
    /** A voice the organization can use. */
    voice?: {id: string; speed?: number};
    /** A model the organization can choose. A customer's own endpoint can't be named. */
    model?: {source: "neuronai" | "external"; id: string};
    /** Decides whether the session is text or a call, over textOnly. */
    textOnly?: boolean;
}

/** How a session starts is exactly one of token, agentId or signedUrl. */
export interface SessionOptions extends Callbacks {
    /** A session token from NeuronAI, or a resume token the server gave this conversation. */
    token?: string;
    /** A public agent's id, for a page on one of its allowed websites. A refusal rejects with a SessionRefusedError. */
    agentId?: string;
    /** A link your server made with an API key. It opens one connection, within 15 minutes. */
    signedUrl?: string;
    /** Where agentId asks for a session. Defaults to https://my.neuronai.uz. */
    apiUrl?: string;
    /** The socket's address. Defaults to wss://my.neuronai.uz/api/v1/realtime, or to where agentId's answer or signedUrl says. */
    serverUrl?: string;
    dynamicVariables?: Record<string, string | number | boolean>;
    /** Only the overrides the agent allows; any other closes the session with 4003. */
    overrides?: SessionOverrides;
    /** Defaults to true. False makes the session a call: the microphone is asked for first. */
    textOnly?: boolean;
    /** The rate a call's agent audio comes at. Defaults to "pcm_24000"; the client plays whatever the server sends. */
    output?: AudioFormat;
    /** A call's microphone and speaker. Defaults to a new BrowserAudio; outside a browser, bring an AudioIO of your own. */
    audio?: AudioIO;
    userId?: string;
    /** Defaults to globalThis.WebSocket. */
    WebSocket?: WebSocketFactory;
    /** How agentId asks for a session. Defaults to globalThis.fetch. */
    fetch?: typeof globalThis.fetch;
    /** Makes each message's client_message_id. Defaults to crypto.randomUUID. */
    idGenerator?: () => string;
    /**
     * The client tools this page runs, by name. A handler gets the agent's values and returns what the agent reads back:
     * text as it is, anything else as JSON, cut to 8,000 characters. A handler that throws answers with its message.
     */
    clientTools?: Record<string, ClientToolHandler>;
}
