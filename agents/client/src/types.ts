import type {AudioFormat, HistoryMessage, LanguageCode, Operator, TurnDebug} from "@naiuz/agents-protocol";
import type {AudioIO} from "./audio/io";

export type Status = "connecting" | "connected" | "reconnecting" | "disconnected";

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
    | {source: "user"; message: string; messageId: number}
    | {source: "user"; message: string; spoken: true; language: LanguageCode; occurredAt: string};

export interface DisconnectDetails {
    /** Who ended it: the app with endSession(), the server, or an error the client couldn't get past. */
    reason: "user" | "server" | "error";
    code?: number;
    message?: string;
}

export interface Callbacks {
    onConnect?: (details: {conversationId: string}) => void;
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
    onError?: (message: string, context: {code: string}) => void;
}

export interface SessionOptions extends Callbacks {
    /** A session token from NeuronAI, or a resume token the server gave this conversation. */
    token: string;
    /** Defaults to wss://my.neuronai.uz/api/v1/realtime. */
    serverUrl?: string;
    dynamicVariables?: Record<string, string | number | boolean>;
    /** Only the overrides the token allows; any other closes the session with 4003. */
    overrides?: {firstMessage?: string; language?: LanguageCode};
    /** Defaults to true. False makes the session a call: the microphone is asked for first. */
    textOnly?: boolean;
    /** The rate a call's agent audio comes at. Defaults to "pcm_24000"; the client plays whatever the server sends. */
    output?: AudioFormat;
    /** A call's microphone and speaker. Defaults to a new BrowserAudio; outside a browser, bring an AudioIO of your own. */
    audio?: AudioIO;
    userId?: string;
    /** Defaults to globalThis.WebSocket. */
    WebSocket?: WebSocketFactory;
    /** Makes each message's client_message_id. Defaults to crypto.randomUUID. */
    idGenerator?: () => string;
}
