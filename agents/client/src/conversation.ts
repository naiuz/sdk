import type {ConversationInitiationClientData, HistoryMessage, ServerEvent} from "@naiuz/agents-protocol";
import {MessageError, SessionError} from "./errors";
import type {DisconnectDetails, MessageAck, SendOptions, SessionOptions, Status, WebSocketFactory, WebSocketLike} from "./types";

const DEFAULT_URL = "wss://my.neuronai.uz/api/v1/realtime";
const OPEN = 1;
const CLOSED = 3;
/** Closes after which the client resumes with its resume token: a lost client, a drain, a lost network, a server error or restart. */
const RESUMABLE = new Set([1001, 1006, 1011, 1012, 1013, 4012]);
/** Closes before the metadata after which the same token opens the session again: a draining or restarting server opened nothing. */
const REOPENABLE = new Set([1012, 1013, 4012]);
const RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 8000;
const MESSAGE_RETRIES = 3;
const RETRY_DELAY_MS = 500;
/** The server pings every 15 seconds, so a socket silent this long is lost, though it may never close. */
const SILENCE_MS = 40_000;
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT_LENGTH = 10_000;

type Timer = ReturnType<typeof setTimeout>;

interface Pending {
    text: string;
    retries: number;
    promise: Promise<MessageAck>;
    resolve: (ack: MessageAck) => void;
    reject: (error: MessageError) => void;
}

/** One conversation with an agent, over the agents protocol. */
export class Conversation {
    private socket: WebSocketLike | null = null;
    private conversationId = "";
    private resumeToken: string | null = null;
    private reconnects = 0;
    private resendOnHistory = false;
    private currentStatus: Status = "disconnected";
    private connectedOnce = false;
    private endedByUser = false;
    private finished = false;
    /** Whether a message the ended session couldn't save can still be saved by resuming the conversation. */
    private resumableAfterEnd = false;
    private endedReason: string | undefined;
    private opening: {resolve: () => void; reject: (error: SessionError) => void} | null = null;
    private readonly pending = new Map<string, Pending>();
    /** Every client_message_id this client sent, so their echoes are dropped. */
    private readonly sentIds = new Set<string>();
    /** The message_ids of the user messages delivered or shown in a history, so a repeat is dropped. */
    private readonly seenMessageIds = new Set<number>();
    private readonly timers = new Set<Timer>();
    private silence: Timer | null = null;
    private readonly WebSocketClass: WebSocketFactory;
    private readonly nextId: () => string;

    private constructor(private readonly options: SessionOptions) {
        this.WebSocketClass = options.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketFactory);
        this.nextId = options.idGenerator ?? (() => globalThis.crypto.randomUUID());
    }

    /** Opens the socket and resolves once the server has answered the handshake. */
    static async startSession(options: SessionOptions): Promise<Conversation> {
        const conversation = new Conversation(options);
        conversation.setStatus("connecting");
        await new Promise<void>((resolve, reject) => {
            conversation.opening = {resolve, reject};
            conversation.connect(options.token);
        });
        return conversation;
    }

    get status(): Status {
        return this.currentStatus;
    }

    getId(): string {
        return this.conversationId;
    }

    /** The newest resume token, for resuming this conversation after a page reload. It changes on every reconnect. */
    getResumeToken(): string | null {
        return this.resumeToken;
    }

    /**
     * Sends a message, resolving once the server has saved it. A message the server couldn't save yet, or one sent
     * while the client reconnects, is sent again with the same client_message_id, so it is saved once. To send a
     * failed message again, pass its clientMessageId; a send of an id still waiting returns that send's promise.
     */
    sendUserMessage(text: string, options: SendOptions = {}): Promise<MessageAck> {
        const clientMessageId = options.clientMessageId ?? this.nextId();
        const waiting = this.pending.get(clientMessageId);
        if (waiting !== undefined) return waiting.promise;
        if (this.finished) return Promise.reject(new MessageError(clientMessageId, this.resumableAfterEnd, "unavailable"));
        if (!CLIENT_MESSAGE_ID.test(clientMessageId) || !isValidText(text)) return Promise.reject(new MessageError(clientMessageId, false, "invalid"));
        const pending = {text, retries: 0, ...deferred<MessageAck>()};
        this.pending.set(clientMessageId, pending);
        this.sentIds.add(clientMessageId);
        this.sendMessage(clientMessageId, text);
        return pending.promise;
    }

    /** Closes the session for good, also while it waits to reconnect. */
    endSession(): Promise<void> {
        if (this.endedByUser) return Promise.resolve();
        this.endedByUser = true;
        const socket = this.socket;
        if (socket !== null && socket.readyState !== CLOSED) {
            socket.close(1000, "ended");
        } else {
            this.finish({reason: "user"});
        }
        return Promise.resolve();
    }

    private connect(token: string): void {
        const socket = new this.WebSocketClass(`${this.options.serverUrl ?? DEFAULT_URL}?token=${encodeURIComponent(token)}`);
        this.socket = socket;
        socket.onopen = () => {
            this.watchSilence(socket);
            this.send(this.initiation());
        };
        socket.onmessage = (event) => {
            if (socket !== this.socket) return;
            this.watchSilence(socket);
            this.receive(event.data);
        };
        socket.onclose = (event) => {
            this.closed(socket, event.code, event.reason);
        };
        // A failed socket closes too, and onclose handles it.
        socket.onerror = () => undefined;
    }

    private initiation(): ConversationInitiationClientData {
        const {dynamicVariables, overrides, userId} = this.options;
        const frame: ConversationInitiationClientData = {type: "conversation_initiation_client_data"};
        if (dynamicVariables !== undefined) frame.dynamic_variables = dynamicVariables;
        if (overrides !== undefined) {
            frame.overrides = {};
            if (overrides.firstMessage !== undefined) frame.overrides.first_message = overrides.firstMessage;
            if (overrides.language !== undefined) frame.overrides.language = overrides.language;
        }
        frame.text_only = this.options.textOnly ?? true;
        if (userId !== undefined) frame.user_id = userId;
        return frame;
    }

    private receive(data: unknown): void {
        if (typeof data !== "string") return;
        let event: ServerEvent;
        try {
            event = JSON.parse(data) as ServerEvent;
        } catch {
            return;
        }
        const o = this.options;
        switch (event.type) {
            case "conversation_initiation_metadata":
                this.conversationId = event.conversation_id;
                this.resumeToken = event.resume_token;
                this.reconnects = 0;
                this.setStatus("connected");
                if (this.connectedOnce) {
                    this.resendOnHistory = true;
                } else {
                    this.connectedOnce = true;
                    o.onConnect?.({conversationId: event.conversation_id});
                    o.onModeChange?.({mode: "text"});
                }
                this.opening?.resolve();
                this.opening = null;
                break;
            case "conversation_history":
                for (const line of event.messages) if (line.message_id !== null) this.seenMessageIds.add(line.message_id);
                o.onHistory?.(event.messages);
                this.settleFromHistory(event.messages);
                if (this.resendOnHistory) {
                    this.resendOnHistory = false;
                    for (const [clientMessageId, pending] of this.pending) this.sendMessage(clientMessageId, pending.text);
                }
                break;
            case "message_ack":
                this.settle(event.client_message_id, (pending) => {
                    pending.resolve({clientMessageId: event.client_message_id, messageId: event.message_id, occurredAt: event.occurred_at});
                });
                break;
            case "message_error":
                this.failed(event.client_message_id, event.retryable, event.code);
                break;
            case "user_message":
                // This client's own message, or one already shown: a reconnect can deliver either again.
                if (this.sentIds.has(event.client_message_id) || this.seenMessageIds.has(event.message_id)) break;
                this.seenMessageIds.add(event.message_id);
                o.onMessage?.({source: "user", message: event.text, messageId: event.message_id});
                break;
            case "agent_typing":
                o.onAgentTyping?.();
                break;
            case "agent_chat_response_part":
                o.onAgentChatResponsePart?.({eventId: event.event_id, type: event.text_response_part.type, text: event.text_response_part.text});
                break;
            case "agent_response":
                o.onMessage?.({source: "ai", message: event.text, eventId: event.event_id});
                break;
            case "agent_response_correction":
                o.onAgentResponseCorrection?.({eventId: event.event_id, text: event.text});
                break;
            case "operator_message":
                o.onMessage?.({source: "operator", message: event.text, eventId: event.event_id, operator: event.operator});
                break;
            case "handoff":
                o.onHandoff?.({reason: event.reason});
                break;
            case "turn_debug":
                o.onDebug?.(event);
                break;
            case "ping":
                this.send({type: "pong", event_id: event.event_id});
                break;
            case "conversation_ended":
                this.endedReason = event.reason;
                break;
            case "error":
                o.onError?.(event.message, {code: event.code});
                break;
            default:
                // A newer server's event: clients ignore what they don't know.
                break;
        }
    }

    /** A waiting message the history shows saved is acked by it: its ack was lost with the old socket. */
    private settleFromHistory(messages: HistoryMessage[]): void {
        for (const {client_message_id: clientMessageId, message_id: messageId, at} of messages) {
            if (clientMessageId === null || messageId === null) continue;
            this.settle(clientMessageId, (pending) => {
                pending.resolve({clientMessageId, messageId, occurredAt: at});
            });
        }
    }

    /** A retryable error sends the message again after a pause that doubles, up to MESSAGE_RETRIES times. */
    private failed(clientMessageId: string, retryable: boolean, code: string): void {
        const pending = this.pending.get(clientMessageId);
        if (pending === undefined) return;
        if (!retryable || pending.retries >= MESSAGE_RETRIES) {
            this.pending.delete(clientMessageId);
            pending.reject(new MessageError(clientMessageId, retryable, code));
            return;
        }
        const delay = RETRY_DELAY_MS * 2 ** pending.retries;
        pending.retries++;
        this.later(delay, () => {
            if (this.pending.get(clientMessageId) === pending) this.sendMessage(clientMessageId, pending.text);
        });
    }

    private settle(clientMessageId: string, apply: (pending: Pending) => void): void {
        const pending = this.pending.get(clientMessageId);
        if (pending === undefined) return;
        this.pending.delete(clientMessageId);
        apply(pending);
    }

    private closed(socket: WebSocketLike, code: number, reason: string): void {
        if (socket !== this.socket) return;
        this.stopWatchingSilence();
        this.resendOnHistory = false;
        if (this.opening !== null) {
            if (!this.endedByUser && REOPENABLE.has(code) && this.reconnects < RECONNECT_ATTEMPTS) {
                this.reconnect(socket, this.options.token);
                return;
            }
            this.opening.reject(new SessionError(code, reason));
            this.opening = null;
            this.setStatus("disconnected");
            return;
        }
        const token = this.resumeToken;
        // A conversation that ended stays ended, even when its close never arrives.
        const resumable = token !== null && !this.endedByUser && this.endedReason === undefined && RESUMABLE.has(code);
        if (resumable && this.reconnects < RECONNECT_ATTEMPTS) {
            this.reconnect(socket, token);
            return;
        }
        this.finish(this.disconnectDetails(code, reason), resumable);
    }

    /** Opens a new socket after a pause that doubles up to a cap, shortened at random so a drained server's clients spread out. */
    private reconnect(socket: WebSocketLike, token: string): void {
        const pause = Math.min(RECONNECT_DELAY_MS * 2 ** this.reconnects, RECONNECT_MAX_DELAY_MS) * (0.5 + Math.random() / 2);
        this.reconnects++;
        if (this.opening === null) this.setStatus("reconnecting");
        this.later(pause, () => {
            if (this.socket === socket && !this.endedByUser) this.connect(token);
        });
    }

    /** Gives up on the socket once it has been silent too long, since a half-open connection may never close. */
    private watchSilence(socket: WebSocketLike): void {
        this.stopWatchingSilence();
        this.silence = this.later(SILENCE_MS, () => {
            this.silence = null;
            if (socket !== this.socket) return;
            socket.onopen = null;
            socket.onmessage = null;
            socket.onclose = null;
            socket.onerror = null;
            socket.close();
            this.closed(socket, 1006, "silent");
        });
    }

    private stopWatchingSilence(): void {
        if (this.silence === null) return;
        clearTimeout(this.silence);
        this.timers.delete(this.silence);
        this.silence = null;
    }

    /** Ends the session, once. Messages still waiting fail, as retryable only when resuming could still save them. */
    private finish(details: DisconnectDetails, resumable = false): void {
        if (this.finished) return;
        this.finished = true;
        this.resumableAfterEnd = resumable;
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        this.silence = null;
        this.setStatus("disconnected");
        for (const [clientMessageId, pending] of this.pending) pending.reject(new MessageError(clientMessageId, resumable, "unavailable"));
        this.pending.clear();
        this.options.onDisconnect?.(details);
    }

    private disconnectDetails(code: number, reason: string): DisconnectDetails {
        if (this.endedByUser) return {reason: "user", code};
        if (this.endedReason !== undefined || code === 1000) return {reason: "server", code, message: this.endedReason ?? reason};
        return {reason: "error", code, message: reason};
    }

    private sendMessage(clientMessageId: string, text: string): void {
        this.send({type: "user_message", client_message_id: clientMessageId, text});
    }

    private send(frame: object): void {
        if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(frame));
    }

    private later(delay: number, run: () => void): Timer {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            run();
        }, delay);
        this.timers.add(timer);
        return timer;
    }

    private setStatus(status: Status): void {
        if (status === this.currentStatus) return;
        this.currentStatus = status;
        this.options.onStatusChange?.({status});
    }
}

/** Whether a text fits the protocol: 1 to 10,000 characters, counted as code points, where .length counts UTF-16 units. */
function isValidText(text: string): boolean {
    return text.length > 0 && (text.length <= MAX_TEXT_LENGTH || Array.from(text).length <= MAX_TEXT_LENGTH);
}

function deferred<T>(): {promise: Promise<T>; resolve: (value: T) => void; reject: (error: MessageError) => void} {
    let resolve: (value: T) => void = () => undefined;
    let reject: (error: MessageError) => void = () => undefined;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return {promise, resolve, reject};
}
