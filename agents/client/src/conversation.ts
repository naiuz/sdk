import type {AudioFormat, AudioFormats, ClientToolCall, ConversationInitiationClientData, HistoryMessage, Overrides, ServerEvent} from "@naiuz/agents-protocol";
import {BrowserAudio} from "./audio/browser";
import type {AudioIO} from "./audio/io";
import {Call} from "./call";
import {MessageError, MicrophoneError, SessionError} from "./errors";
import {requestSession} from "./session";
import type {Callbacks, ConversationStatus, DisconnectDetails, MessageAck, Mode, SendOptions, SessionOptions, SessionOverrides, Status, WebSocketFactory, WebSocketLike} from "./types";

const DEFAULT_URL = "wss://my.neuronai.uz/api/v1/realtime";
/** How long the last of a call's audio can keep the speaker, about what the server sends ahead and more. */
const GOODBYE_LIMIT_MS = 2_000;
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
const MAX_UPDATE_LENGTH = 2000;
/** How often it's worth saying the customer is typing: the server's limit allows about twice this. */
const ACTIVITY_EVERY_MS = 1000;
/** What a session holds to say when its connection is back. */
const MAX_HELD_FRAMES = 32;
/** The longest client tool result the protocol takes, in characters. */
const MAX_TOOL_RESULT = 8000;
/** A client tool's name as the protocol takes it, and how many a page may run. */
const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_CLIENT_TOOLS = 32;
const OUTPUT_RATES: Record<AudioFormat, number> = {pcm_16000: 16_000, pcm_24000: 24_000};
/** The browser's errors for a microphone refused, missing, held by another app, or barred from the page. */
const MICROPHONE_ERRORS = new Set(["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "SecurityError"]);

type Timer = ReturnType<typeof setTimeout>;

interface Pending {
    text: string;
    replyToMessageId: number | undefined;
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
    /** A call's microphone and speaker, kept across reconnects; null for a text session. */
    private readonly audio: AudioIO | null;
    private audioClosed = false;
    /** Set while a goodbye plays, for an app that ends the call before it's done. */
    private releaseAudio: (() => void) | null = null;
    /** The server closed normally, so the last of a call's audio plays before it's released. */
    private goodbye = false;
    /** This connection's side of the call, from its metadata to its close. */
    private call: Call | null = null;
    private mode: Mode | null = null;
    private lastActivity = Number.NEGATIVE_INFINITY;
    /** Updates and feedback the page gave while the connection was down. */
    private readonly held: object[] = [];
    /** The status the last metadata gave, so a reconnect reports only a change. */
    private conversationStatus: ConversationStatus | null = null;
    /** Where the socket goes, and the token it first opens with. */
    private serverUrl: string;
    private sessionToken: string;

    private constructor(private readonly options: SessionOptions) {
        // Before anything starts, so a link that isn't one costs nothing.
        const link = options.signedUrl === undefined ? null : new URL(options.signedUrl);
        this.sessionToken = options.token ?? link?.searchParams.get("token") ?? "";
        if (link !== null) link.search = "";
        this.serverUrl = link?.href ?? options.serverUrl ?? DEFAULT_URL;
        this.WebSocketClass = options.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketFactory);
        this.nextId = options.idGenerator ?? (() => globalThis.crypto.randomUUID());
        // Made here, before startSession's first await, so its context starts inside the caller's gesture.
        this.audio = (options.overrides?.textOnly ?? options.textOnly) === false ? (options.audio ?? new BrowserAudio()) : null;
    }

    /**
     * Opens the socket and resolves once the server has answered the handshake. A call asks for the microphone first,
     * so a refused microphone rejects with MicrophoneError before any socket opens.
     */
    static async startSession(options: SessionOptions): Promise<Conversation> {
        checkClientTools(Object.keys(options.clientTools ?? {}));
        if ([options.token, options.agentId, options.signedUrl].filter((start) => start !== undefined).length !== 1) {
            throw new TypeError("A session starts from exactly one of token, agentId or signedUrl.");
        }
        const conversation = new Conversation(options);
        conversation.setStatus("connecting");
        if (conversation.audio !== null) await conversation.startMicrophone(conversation.audio);
        // After the microphone, since this token lasts a minute and the browser's prompt can take longer.
        if (options.agentId !== undefined) await conversation.askForSession(options.agentId);
        await new Promise<void>((resolve, reject) => {
            conversation.opening = {resolve, reject};
            conversation.connect(conversation.sessionToken);
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
        const pending = {text, replyToMessageId: options.replyToMessageId, retries: 0, ...deferred<MessageAck>()};
        this.pending.set(clientMessageId, pending);
        this.sentIds.add(clientMessageId);
        this.sendMessage(clientMessageId, pending);
        return pending.promise;
    }

    /**
     * Tells the agent something without interrupting it, such as what the customer is looking at. It reads this at its
     * next turn, as information and never as instructions. A newer update with the same contextId replaces the older
     * one. Said while the connection is down, it goes out when it's back. Says whether it went or will.
     */
    sendContextualUpdate(text: string, options: {contextId?: string} = {}): boolean {
        checkContextualUpdate(text, options);
        const {contextId} = options;
        return this.sendWhenConnected({type: "contextual_update", text, ...(contextId === undefined ? {} : {context_id: contextId})});
    }

    /**
     * The customer is typing: a reply that hasn't started holds off for about 2 seconds. Call it on every key: it goes
     * out at most once a second, and only while connected.
     */
    sendUserActivity(): void {
        const now = Date.now();
        if (this.currentStatus !== "connected" || now - this.lastActivity < ACTIVITY_EVERY_MS) return;
        this.lastActivity = now;
        this.send({type: "user_activity"});
    }

    /**
     * The customer's view of a reply, by its eventId. Null takes it back. Said while the connection is down, it goes out
     * when it's back. Says whether it went or will: once the session is over it can't, so hide the thumbs then.
     */
    sendFeedback(eventId: number, score: "like" | "dislike" | null): boolean {
        checkFeedback(eventId);
        return this.sendWhenConnected({type: "feedback", event_id: eventId, score});
    }

    /** Moves a call to this microphone without dropping it. When it can't, the call stays on the one it has. Outside a call it does nothing. */
    async changeInputDevice({deviceId}: {deviceId: string}): Promise<void> {
        const audio = this.liveAudio();
        if (audio === null) return;
        if (audio.changeInputDevice === undefined) throw new Error("This call's audio can't change its microphone.");
        await audio.changeInputDevice(deviceId);
    }

    /** Sends the agent's voice to this speaker. Where the browser can't, this rejects and the sound stays where it was. Outside a call it does nothing. */
    async changeOutputDevice({deviceId}: {deviceId: string}): Promise<void> {
        const audio = this.liveAudio();
        if (audio === null) return;
        if (audio.changeOutputDevice === undefined) throw new Error("This call's audio can't change its speaker.");
        await audio.changeOutputDevice(deviceId);
    }

    /** Mutes the microphone: the call goes on, and the agent hears silence. Outside a call it does nothing. */
    setMicMuted(muted: boolean): void {
        this.liveAudio()?.setMuted(muted);
    }

    /** The agent's volume in a call, from 0 to 1. */
    setVolume({volume}: {volume: number}): void {
        if (Number.isFinite(volume)) this.liveAudio()?.setVolume(Math.min(1, Math.max(0, volume)));
    }

    /** The microphone's level, from 0 to 1; 0 outside a call. */
    getInputVolume(): number {
        return this.liveAudio()?.inputLevel() ?? 0;
    }

    /** The agent's level as it plays, from 0 to 1; 0 outside a call. */
    getOutputVolume(): number {
        return this.liveAudio()?.outputLevel() ?? 0;
    }

    /**
     * Closes the session for good, also while it waits to reconnect. A call's microphone and the agent's voice stop at
     * once, without waiting for the socket's close, which a lost network can hold up for long.
     */
    endSession(): Promise<void> {
        if (this.endedByUser) return Promise.resolve();
        this.endedByUser = true;
        this.call?.stop();
        this.call = null;
        this.releaseAudio?.();
        const socket = this.socket;
        const open = socket !== null && socket.readyState !== CLOSED;
        if (open) socket.close(1000, "ended");
        this.finish(open ? {reason: "user", code: 1000} : {reason: "user"});
        return Promise.resolve();
    }

    private async startMicrophone(audio: AudioIO): Promise<void> {
        audio.onInputLost = () => {
            this.emit("onError", "The microphone stopped.", {code: "microphone_lost"});
        };
        try {
            await audio.startCapture();
        } catch (error) {
            this.closeAudio();
            this.setStatus("disconnected");
            // An AudioIO of the app's may throw the browser's own error; anything else isn't the microphone's.
            throw error instanceof Error && !(error instanceof MicrophoneError) && MICROPHONE_ERRORS.has(error.name) ? new MicrophoneError(error) : error;
        }
    }

    private async askForSession(agentId: string): Promise<void> {
        const {apiUrl, fetch, serverUrl} = this.options;
        try {
            const session = await requestSession(agentId, this.audio !== null, apiUrl, fetch);
            this.sessionToken = session.token;
            this.serverUrl = serverUrl ?? session.url;
        } catch (error) {
            this.closeAudio();
            this.setStatus("disconnected");
            throw error;
        }
    }

    private connect(token: string): void {
        const socket = new this.WebSocketClass(`${this.serverUrl}?token=${encodeURIComponent(token)}`);
        socket.binaryType = "arraybuffer";
        this.socket = socket;
        // From here, so a socket that never opens gives up too.
        this.watchSilence(socket);
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

    /** Whether this session has been opened on the server, so its reconnects only go on with it. */
    private heardMetadata = false;

    private initiation(): ConversationInitiationClientData {
        const {dynamicVariables, overrides, userId} = this.options;
        const frame: ConversationInitiationClientData = {type: "conversation_initiation_client_data"};
        if (dynamicVariables !== undefined) frame.dynamic_variables = dynamicVariables;
        if (overrides !== undefined) {
            // The language opens a conversation. Asking again on a reconnect would undo a move since.
            const {language, ...rest} = protocolOverrides(overrides);
            const after = this.heardMetadata ? rest : {language, ...rest};
            if (Object.values(after).some((value) => value !== undefined)) frame.overrides = after;
        }
        frame.text_only = this.audio === null;
        if (this.audio !== null) frame.audio = {input: "pcm_16000", output: this.options.output ?? "pcm_24000"};
        if (userId !== undefined) frame.user_id = userId;
        const tools = Object.keys(this.options.clientTools ?? {});
        if (tools.length > 0) frame.client_tools = tools;
        return frame;
    }

    private receive(data: unknown): void {
        if (data instanceof ArrayBuffer) {
            this.call?.agentAudio(data);
            return;
        }
        if (typeof data !== "string") return;
        let event: ServerEvent;
        try {
            event = JSON.parse(data) as ServerEvent;
        } catch {
            return;
        }
        switch (event.type) {
            case "conversation_initiation_metadata":
                this.heardMetadata = true;
                this.conversationId = event.conversation_id;
                this.resumeToken = event.resume_token;
                this.reconnects = 0;
                this.startCall(event.audio ?? null);
                this.setStatus("connected");
                for (const frame of this.held.splice(0)) this.send(frame);
                if (this.connectedOnce) {
                    this.resendOnHistory = true;
                } else {
                    this.connectedOnce = true;
                    this.emit("onConnect", {conversationId: event.conversation_id, status: event.status});
                    // A call's mode comes with the agent's state.
                    if (this.call === null) this.changeMode("text");
                }
                if (event.status !== this.conversationStatus) {
                    this.conversationStatus = event.status;
                    this.emit("onConversationStatus", {status: event.status});
                }
                this.opening?.resolve();
                this.opening = null;
                break;
            case "conversation_history":
                for (const line of event.messages) if (line.message_id !== null) this.seenMessageIds.add(line.message_id);
                this.emit("onHistory", event.messages);
                this.settleFromHistory(event.messages);
                if (this.resendOnHistory) {
                    this.resendOnHistory = false;
                    for (const [clientMessageId, pending] of this.pending) this.sendMessage(clientMessageId, pending);
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
                this.emit("onMessage", {source: "user", message: event.text, messageId: event.message_id});
                break;
            case "agent_typing":
                this.emit("onAgentTyping");
                break;
            case "agent_chat_response_part":
                this.emit("onAgentChatResponsePart", {eventId: event.event_id, type: event.text_response_part.type, text: event.text_response_part.text});
                break;
            case "agent_response":
                this.emit("onMessage", {source: "ai", message: event.text, eventId: event.event_id});
                break;
            case "agent_response_correction":
                this.emit("onAgentResponseCorrection", {eventId: event.event_id, text: event.text});
                break;
            case "operator_message":
                this.emit("onMessage", {source: "operator", message: event.text, eventId: event.event_id, operator: event.operator, messageId: event.message_id ?? null});
                break;
            case "operator_typing":
                this.emit("onOperatorTyping", {operator: event.operator});
                break;
            case "handoff":
                this.emit("onHandoff", {reason: event.reason});
                break;
            case "client_tool_call":
                this.runClientTool(event);
                break;
            case "turn_debug":
                this.emit("onDebug", event);
                break;
            case "agent_state":
                this.changeMode(event.state);
                break;
            case "user_transcript":
                this.emit("onMessage", {source: "user", message: event.text, spoken: true, language: event.language, occurredAt: event.occurred_at});
                break;
            case "audio_pause":
                this.call?.pause(event.event_id);
                break;
            case "audio_resume":
                this.call?.resume();
                break;
            case "interruption":
                this.call?.interrupt(event.event_id);
                this.emit("onInterruption", {eventId: event.event_id});
                break;
            case "agent_tool_response":
                this.emit("onAgentToolResponse", {toolName: event.tool_name, toolType: event.tool_type, status: event.status});
                break;
            case "language_changed":
                this.emit("onLanguageChange", {language: event.language});
                break;
            case "guardrail_triggered":
                this.emit("onGuardrailTriggered", {name: event.name, action: event.action});
                break;
            case "agent_transferred":
                this.emit("onAgentTransferred", {agentId: event.agent_id, agentName: event.agent_name});
                break;
            case "ping":
                this.send({type: "pong", event_id: event.event_id});
                break;
            case "conversation_ended":
                this.endedReason = event.reason;
                break;
            case "error":
                this.emit("onError", event.message, {code: event.code});
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
            if (this.pending.get(clientMessageId) === pending) this.sendMessage(clientMessageId, pending);
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
        // The server closes when it reckons a goodbye has played, and this end is behind that.
        const over = code === 1000 || this.endedReason !== undefined;
        const letItFinish = over && !this.endedByUser && this.opening === null;
        this.goodbye = letItFinish;
        this.call?.stop(letItFinish);
        this.call = null;
        this.resendOnHistory = false;
        if (this.opening !== null) {
            if (!this.endedByUser && REOPENABLE.has(code) && this.reconnects < RECONNECT_ATTEMPTS) {
                this.reconnect(socket, this.sessionToken);
                return;
            }
            this.opening.reject(new SessionError(code, reason));
            this.opening = null;
            this.closeAudio();
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
        this.closeAudio(this.goodbye);
        this.setStatus("disconnected");
        for (const [clientMessageId, pending] of this.pending) pending.reject(new MessageError(clientMessageId, resumable, "unavailable"));
        this.pending.clear();
        this.emit("onDisconnect", details);
    }

    private disconnectDetails(code: number, reason: string): DisconnectDetails {
        if (this.endedByUser) return {reason: "user", code};
        // A call another connection took over was ended by the server too.
        if (this.endedReason !== undefined || code === 1000 || code === 4008) return {reason: "server", code, message: this.endedReason ?? reason};
        return {reason: "error", code, message: reason};
    }

    /** This connection's side of the call, once the server has taken it: the metadata names its output. */
    private startCall(formats: AudioFormats | null): void {
        const {audio, socket} = this;
        if (audio === null || socket === null || formats === null) return;
        const channel = {
            send: (data: string | Uint8Array) => {
                if (socket.readyState === OPEN) socket.send(data);
            },
            buffered: () => socket.bufferedAmount ?? 0,
        };
        this.call = new Call(channel, audio, OUTPUT_RATES[formats.output]);
        if (formats.environment !== undefined) {
            const {ambience_url: ambience, volume, phone_filter: phoneFilter} = formats.environment;
            audio.setEnvironment?.({ambienceUrl: ambience === null ? null : this.fromSocket(ambience), volume, phoneFilter});
        }
    }

    /** An address the server gave, relative to its socket's, so a proxy in front changes nothing. */
    private fromSocket(path: string): string | null {
        const socket = this.serverUrl.replace(/^ws/, "http").replace(/\/*$/, "/");
        try {
            return new URL(path, new URL(socket, (globalThis as {location?: {href: string}}).location?.href)).href;
        } catch {
            return null;
        }
    }

    /** The call's audio, until the session is over. */
    private liveAudio(): AudioIO | null {
        return this.audioClosed ? null : this.audio;
    }

    /** Releases the microphone and the speaker, once, when the session is over, after a goodbye has played. */
    private closeAudio(letItFinish = false): void {
        const audio = this.audio;
        if (audio === null || this.audioClosed || this.releaseAudio !== null) return;
        const release = () => {
            if (this.audioClosed) return;
            this.audioClosed = true;
            this.releaseAudio = null;
            void audio.close().catch(() => undefined);
        };
        this.releaseAudio = release;
        const drained = letItFinish ? audio.drain?.(GOODBYE_LIMIT_MS) : undefined;
        if (drained === undefined) {
            release();
            return;
        }
        audio.stopCapture?.();
        void drained.then(release, release);
    }

    private changeMode(mode: Mode): void {
        if (mode === this.mode) return;
        this.mode = mode;
        this.emit("onModeChange", {mode});
    }

    /** Runs the page's handler for the agent's call, and answers it when the agent waits for the result. */
    private runClientTool(call: ClientToolCall): void {
        const answer = (result: string, isError: boolean) => {
            if (!call.expects_response) return;
            const cut = Array.from(result).slice(0, MAX_TOOL_RESULT).join("");
            this.send({type: "client_tool_result", tool_call_id: call.tool_call_id, result: cut, is_error: isError});
        };
        const handler = this.options.clientTools?.[call.tool_name];
        if (handler === undefined) {
            this.emit("onUnhandledClientToolCall", {
                toolCallId: call.tool_call_id, toolName: call.tool_name, parameters: call.parameters, expectsResponse: call.expects_response,
            });
            answer(`This page has no tool called ${call.tool_name}.`, true);
            return;
        }
        let running: Promise<unknown>;
        try {
            running = Promise.resolve(handler(call.parameters));
        } catch (error) {
            running = Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
        running.then(
            (value) => {
                answer(resultText(value), false);
            },
            (error: unknown) => {
                answer(error instanceof Error ? error.message : String(error), true);
            },
        );
    }

    private sendMessage(clientMessageId: string, {text, replyToMessageId}: Pick<Pending, "text" | "replyToMessageId">): void {
        this.send({
            type: "user_message",
            client_message_id: clientMessageId,
            text,
            ...(replyToMessageId === undefined ? {} : {reply_to_message_id: replyToMessageId}),
        });
    }

    private send(frame: object): void {
        if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(frame));
    }

    private sendWhenConnected(frame: object): boolean {
        if (this.finished || this.endedByUser) return false;
        if (this.currentStatus === "connected") {
            this.send(frame);
            return true;
        }
        // The newest matter most: they say where the customer is now.
        if (this.held.length >= MAX_HELD_FRAMES) this.held.shift();
        this.held.push(frame);
        return true;
    }

    private later(delay: number, run: () => void): Timer {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            run();
        }, delay);
        this.timers.add(timer);
        return timer;
    }

    /** Calls one of the app's callbacks. One that throws is reported, and the client goes on as if it had returned. */
    private emit<Name extends keyof Callbacks>(name: Name, ...args: Parameters<NonNullable<Callbacks[Name]>>): void {
        const callback = this.options[name] as ((...given: unknown[]) => void) | undefined;
        if (callback === undefined) return;
        try {
            callback(...args);
        } catch (error) {
            reportCallbackError(error);
        }
    }

    private setStatus(status: Status): void {
        if (status === this.currentStatus) return;
        this.currentStatus = status;
        this.emit("onStatusChange", {status});
    }
}

/** Whether a text fits the protocol: 1 to 10,000 characters, counted as code points, where .length counts UTF-16 units. */
function isValidText(text: string): boolean {
    return text.length > 0 && (text.length <= MAX_TEXT_LENGTH || Array.from(text).length <= MAX_TEXT_LENGTH);
}

/** The server refuses a whole handshake over a client tool it can't take, so a bad one rejects here, by name. */
/** A wrong argument throws here, rather than coming back later as a frame the server refused. */
export function checkContextualUpdate(text: string, {contextId}: {contextId?: string} = {}): void {
    if (text.length === 0 || text.length > MAX_UPDATE_LENGTH) throw new TypeError(`A contextual update takes 1 to ${String(MAX_UPDATE_LENGTH)} characters.`);
    if (contextId !== undefined && !CLIENT_MESSAGE_ID.test(contextId)) throw new TypeError(`A contextId must match ${String(CLIENT_MESSAGE_ID)}.`);
}

export function checkFeedback(eventId: number): void {
    if (!Number.isSafeInteger(eventId) || eventId < 1) throw new TypeError("Feedback rates a reply by its eventId.");
}

function protocolOverrides({firstMessage, textOnly, ...same}: SessionOverrides): Overrides {
    const overrides: Overrides = same;
    if (firstMessage !== undefined) overrides.first_message = firstMessage;
    if (textOnly !== undefined) overrides.text_only = textOnly;
    return overrides;
}

function checkClientTools(names: string[]): void {
    if (names.length > MAX_CLIENT_TOOLS) throw new TypeError(`A page runs at most ${String(MAX_CLIENT_TOOLS)} client tools, not ${String(names.length)}.`);
    const invalid = names.find((name) => !TOOL_NAME.test(name));
    if (invalid !== undefined) throw new TypeError(`"${invalid}" isn't a client tool name: use the tool's name on the agent, in snake_case.`);
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

/** An error an app's callback threw, shown where the runtime shows uncaught errors without stopping the client. */
function reportCallbackError(error: unknown): void {
    const report = (globalThis as {reportError?: (error: unknown) => void}).reportError;
    if (typeof report === "function") {
        report(error);
        return;
    }
    setTimeout(() => {
        throw error;
    });
}

/** JSON.stringify as it behaves: undefined for undefined and functions, though its type says string. */
const stringify = JSON.stringify as (value: unknown) => string | undefined;

/** A handler's result as the agent reads it: text as it is, anything else as JSON, nothing for what has none. */
function resultText(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return stringify(value) ?? "";
    } catch {
        return "";
    }
}
