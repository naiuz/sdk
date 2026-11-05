import {checkContextualUpdate, checkFeedback, Conversation} from "./conversation";
import type {Callbacks, ConversationStatus, MessageAck, Mode, SendOptions, SessionOptions, Status} from "./types";

/** What a page shows of its session. A change is a new object, so a framework can compare. */
export interface ConversationState {
    status: Status;
    /** "text" in a text session; in a call, the agent's state. Null before a session starts and after it ends. */
    mode: Mode | null;
    /** Who is handling the conversation, from the session's metadata; null before a session starts and after it ends. */
    conversationStatus: ConversationStatus | null;
    micMuted: boolean;
}

/** Every callback the client calls, so each can reach the app's of the moment. */
const CALLBACKS: readonly (keyof Callbacks)[] = [
    "onConnect",
    "onConversationStatus",
    "onDisconnect",
    "onStatusChange",
    "onModeChange",
    "onMessage",
    "onAgentChatResponsePart",
    "onAgentResponseCorrection",
    "onAgentTyping",
    "onOperatorTyping",
    "onHistory",
    "onHandoff",
    "onDebug",
    "onUnhandledClientToolCall",
    "onInterruption",
    "onAgentToolResponse",
    "onLanguageChange",
    "onGuardrailTriggered",
    "onAgentTransferred",
    "onError",
];

/**
 * A page's conversation with an agent: the session's state and its methods, for the Vue composable and the React hook
 * to sit on. Starting again ends what came before, whichever arrives first. The app's callbacks run after the state has
 * changed. Disposing ends the session and leaves the controller usable, as React's StrictMode needs.
 */
export class ConversationController {
    private state: ConversationState = {status: "disconnected", mode: null, conversationStatus: null, micMuted: false};
    private readonly listeners = new Set<() => void>();
    private readonly callbacks: () => Callbacks;
    private conversation: Conversation | null = null;
    /** Each start's number: a session's callbacks change the state only while it is the newest. */
    private starts = 0;
    /** The start still waiting for its session, which endSession() can stop. */
    private pending: number | null = null;
    /** What the page said while a start was on its way, for the session it brings. */
    private readonly early: ((conversation: Conversation) => boolean)[] = [];

    constructor(callbacks: Callbacks | (() => Callbacks) = {}) {
        this.callbacks = typeof callbacks === "function" ? callbacks : () => callbacks;
    }

    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    readonly getSnapshot = (): ConversationState => this.state;

    /** Starts a session, ending the one before; resolves to the conversation's id. */
    readonly startSession = async (options: Omit<SessionOptions, keyof Callbacks>): Promise<string> => {
        const start = ++this.starts;
        this.pending = start;
        this.early.length = 0;
        // The session being replaced no longer reports its mode or status, so none shows until the new one has its own.
        this.change({mode: null, conversationStatus: null});
        const replaced = this.conversation;
        this.conversation = null;
        // Started before the old one ends, so its audio starts inside the caller's gesture, whatever the end takes.
        const starting = Conversation.startSession({...options, ...this.ownCallbacks(start)});
        void replaced?.endSession();
        let started: Conversation;
        try {
            started = await starting;
        } catch (error) {
            if (start === this.starts) this.early.length = 0;
            throw error;
        } finally {
            if (this.pending === start) this.pending = null;
        }
        if (start !== this.starts) {
            // A newer start, or the end of whoever asked, came while this one waited.
            await started.endSession();
            throw new Error("A newer session replaced this one before it started.");
        }
        this.conversation = started;
        if (this.state.micMuted) started.setMicMuted(true);
        for (const say of this.early.splice(0)) say(started);
        return started.getId();
    };

    /** Ends the session. A start still on its way stops: it shows as disconnected at once, and closes when it arrives. */
    readonly endSession = async (): Promise<void> => {
        if (this.pending !== null) {
            // A start still on its way ends itself when it arrives; until then nothing shows it, and its callbacks are
            // no longer the app's.
            this.pending = null;
            this.starts++;
            this.early.length = 0;
            this.change({status: "disconnected", mode: null, conversationStatus: null});
            this.callbacks().onStatusChange?.({status: "disconnected"});
            this.callbacks().onDisconnect?.({reason: "user"});
            return;
        }
        const ending = this.conversation;
        this.conversation = null;
        this.change({conversationStatus: null});
        await ending?.endSession();
    };

    /** Ends whatever is going, for a page that's leaving. Nothing it had started reports any more. */
    readonly dispose = (): void => {
        this.starts++;
        this.pending = null;
        this.early.length = 0;
        void this.endSession();
        // Nothing reports any more, so nothing else would say it's over.
        this.change({status: "disconnected", mode: null, conversationStatus: null});
    };

    readonly sendUserMessage = (text: string, options?: SendOptions): Promise<MessageAck> =>
        this.conversation?.sendUserMessage(text, options) ?? Promise.reject(new Error("Start a session before sending a message."));

    /** Said while a session starts, it goes out once it has: onConnect is when a page tells it where the customer is. */
    readonly sendContextualUpdate = (text: string, options?: {contextId?: string}): boolean => {
        checkContextualUpdate(text, options);
        return this.whenStarted((conversation) => conversation.sendContextualUpdate(text, options));
    };

    readonly sendUserActivity = (): void => {
        this.conversation?.sendUserActivity();
    };

    readonly sendFeedback = (eventId: number, score: "like" | "dislike" | null): boolean => {
        checkFeedback(eventId);
        return this.whenStarted((conversation) => conversation.sendFeedback(eventId, score));
    };

    readonly setMicMuted = (muted: boolean): void => {
        this.change({micMuted: muted});
        this.conversation?.setMicMuted(muted);
    };

    readonly setVolume = (options: {volume: number}): void => {
        this.conversation?.setVolume(options);
    };

    readonly getInputVolume = (): number => this.conversation?.getInputVolume() ?? 0;

    readonly getOutputVolume = (): number => this.conversation?.getOutputVolume() ?? 0;

    readonly changeInputDevice = (options: {deviceId: string}): Promise<void> =>
        this.conversation?.changeInputDevice(options) ?? Promise.resolve();

    readonly changeOutputDevice = (options: {deviceId: string}): Promise<void> =>
        this.conversation?.changeOutputDevice(options) ?? Promise.resolve();

    /** The conversation's id, or "" outside a session. */
    readonly getId = (): string => this.conversation?.getId() ?? "";

    readonly getResumeToken = (): string | null => this.conversation?.getResumeToken() ?? null;

    private whenStarted(say: (conversation: Conversation) => boolean): boolean {
        if (this.conversation !== null) return say(this.conversation);
        if (this.pending === null) return false;
        this.early.push(say);
        return true;
    }

    private change(next: Partial<ConversationState>): void {
        this.state = {...this.state, ...next};
        for (const listener of this.listeners) listener();
    }

    /** A session's callbacks: the state changes, then the app hears, only while it is the newest. */
    private ownCallbacks(start: number): Callbacks {
        const current = () => start === this.starts;
        const forwarded = Object.fromEntries(
            CALLBACKS.map((name) => [
                name,
                (...args: unknown[]) => {
                    if (current()) (this.callbacks()[name] as ((...given: unknown[]) => void) | undefined)?.(...args);
                },
            ]),
        ) as Callbacks;
        return {
            ...forwarded,
            onStatusChange: (change) => {
                if (!current()) return;
                this.change({status: change.status});
                this.callbacks().onStatusChange?.(change);
            },
            onModeChange: (change) => {
                if (!current()) return;
                this.change({mode: change.mode});
                this.callbacks().onModeChange?.(change);
            },
            onConversationStatus: (change) => {
                if (!current()) return;
                this.change({conversationStatus: change.status});
                this.callbacks().onConversationStatus?.(change);
            },
            onDisconnect: (details) => {
                if (!current()) return;
                this.conversation = null;
                this.change({mode: null, conversationStatus: null});
                this.callbacks().onDisconnect?.(details);
            },
        };
    }
}
