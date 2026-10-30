import type {ConversationInitiationClientData, ServerEvent} from "@naiuz/agents-protocol";
import {MessageError, SessionError} from "./errors";
import type {DisconnectDetails, MessageAck, SessionOptions, Status, WebSocketFactory, WebSocketLike} from "./types";

const DEFAULT_URL = "wss://my.neuronai.uz/api/v1/realtime";
const OPEN = 1;

interface Pending {
    text: string;
    resolve: (ack: MessageAck) => void;
    reject: (error: MessageError) => void;
}

/** One conversation with an agent, over the agents protocol. */
export class Conversation {
    private socket: WebSocketLike | null = null;
    private conversationId = "";
    private currentStatus: Status = "disconnected";
    private connectedOnce = false;
    private endedByUser = false;
    private endedReason: string | undefined;
    private opening: {resolve: () => void; reject: (error: SessionError) => void} | null = null;
    private readonly pending = new Map<string, Pending>();
    private readonly WebSocketClass: WebSocketFactory;
    private readonly nextId: () => string;

    private constructor(private readonly options: SessionOptions) {
        this.WebSocketClass = options.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketFactory);
        this.nextId = options.idGenerator ?? (() => globalThis.crypto.randomUUID());
    }

    /** Opens the socket and resolves once the server has answered the handshake. */
    static async startSession(options: SessionOptions): Promise<Conversation> {
        const conversation = new Conversation(options);
        await conversation.open(options.token);
        return conversation;
    }

    get status(): Status {
        return this.currentStatus;
    }

    getId(): string {
        return this.conversationId;
    }

    /** Sends a message, resolving once the server has saved it. */
    sendUserMessage(text: string): Promise<MessageAck> {
        const clientMessageId = this.nextId();
        return new Promise((resolve, reject) => {
            this.pending.set(clientMessageId, {text, resolve, reject});
            this.sendMessage(clientMessageId, text);
        });
    }

    /** Closes the session for good. */
    endSession(): Promise<void> {
        this.endedByUser = true;
        this.socket?.close(1000, "ended");
        return Promise.resolve();
    }

    private open(token: string): Promise<void> {
        this.setStatus("connecting");
        const socket = new this.WebSocketClass(`${this.options.serverUrl ?? DEFAULT_URL}?token=${encodeURIComponent(token)}`);
        this.socket = socket;
        return new Promise((resolve, reject) => {
            this.opening = {resolve, reject};
            socket.onopen = () => {
                this.send(this.initiation());
            };
            socket.onmessage = (event) => {
                this.receive(event.data);
            };
            socket.onclose = (event) => {
                this.closed(socket, event.code, event.reason);
            };
            // A failed socket closes too, and onclose handles it.
            socket.onerror = () => undefined;
        });
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
                this.setStatus("connected");
                if (!this.connectedOnce) {
                    this.connectedOnce = true;
                    o.onConnect?.({conversationId: event.conversation_id});
                    o.onModeChange?.({mode: "text"});
                }
                this.opening?.resolve();
                this.opening = null;
                break;
            case "conversation_history":
                o.onHistory?.(event.messages);
                break;
            case "message_ack":
                this.settle(event.client_message_id, (pending) => {
                    pending.resolve({clientMessageId: event.client_message_id, messageId: event.message_id, occurredAt: event.occurred_at});
                });
                break;
            case "message_error":
                this.settle(event.client_message_id, (pending) => {
                    pending.reject(new MessageError(event.client_message_id, event.retryable, event.code));
                });
                break;
            case "user_message":
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

    private settle(clientMessageId: string, apply: (pending: Pending) => void): void {
        const pending = this.pending.get(clientMessageId);
        if (pending === undefined) return;
        this.pending.delete(clientMessageId);
        apply(pending);
    }

    private closed(socket: WebSocketLike, code: number, reason: string): void {
        if (socket !== this.socket) return;
        if (this.opening !== null) {
            this.opening.reject(new SessionError(code, reason));
            this.opening = null;
            this.setStatus("disconnected");
            return;
        }
        this.setStatus("disconnected");
        this.options.onDisconnect?.(this.disconnectDetails(code, reason));
    }

    private disconnectDetails(code: number, reason: string): DisconnectDetails {
        if (this.endedByUser) return {reason: "user", code};
        if (code === 1000) return {reason: "server", code, message: this.endedReason ?? reason};
        return {reason: "error", code, message: reason};
    }

    private sendMessage(clientMessageId: string, text: string): void {
        this.send({type: "user_message", client_message_id: clientMessageId, text});
    }

    private send(frame: object): void {
        if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(frame));
    }

    private setStatus(status: Status): void {
        if (status === this.currentStatus) return;
        this.currentStatus = status;
        this.options.onStatusChange?.({status});
    }
}
