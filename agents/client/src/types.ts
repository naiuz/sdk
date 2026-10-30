import type {HistoryMessage, LanguageCode, Operator, TurnDebug} from "@naiuz/agents-protocol";

export type Status = "connecting" | "connected" | "reconnecting" | "disconnected";

/** The part of the browser's WebSocket the client uses, so tests and other runtimes can supply their own. */
export interface WebSocketLike {
    readonly readyState: number;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: {data: unknown}) => void) | null;
    onclose: ((event: {code: number; reason: string}) => void) | null;
    onerror: ((event: unknown) => void) | null;
    send(data: string): void;
    close(code?: number, reason?: string): void;
}

export type WebSocketFactory = new (url: string) => WebSocketLike;

/** A message the server has saved. */
export interface MessageAck {
    clientMessageId: string;
    messageId: number;
    occurredAt: string;
}

/** A message for the transcript: the agent's reply, an operator's, or another viewer's. */
export type IncomingMessage =
    | {source: "ai"; message: string; eventId: number}
    | {source: "operator"; message: string; eventId: number; operator: Operator}
    | {source: "user"; message: string; messageId: number};

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
    onModeChange?: (change: {mode: "text"}) => void;
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
    /** Defaults to true: this version speaks text only. */
    textOnly?: boolean;
    userId?: string;
    /** Defaults to globalThis.WebSocket. */
    WebSocket?: WebSocketFactory;
    /** Makes each message's client_message_id. Defaults to crypto.randomUUID. */
    idGenerator?: () => string;
}
