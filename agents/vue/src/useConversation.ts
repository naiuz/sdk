import {Conversation} from "@naiuz/agents";
import type {Callbacks, ConversationStatus, MessageAck, Mode, SendOptions, SessionOptions, Status} from "@naiuz/agents";
import {computed, getCurrentScope, onScopeDispose, readonly, shallowRef} from "vue";
import type {ComputedRef, Ref} from "vue";

/** What useConversation gives a component: the session's state as refs, and its methods. */
export interface UseConversation {
    status: Readonly<Ref<Status>>;
    /** "text" in a text session; in a call, the agent's state. Null before a session starts and after it ends. */
    mode: Readonly<Ref<Mode | null>>;
    isSpeaking: ComputedRef<boolean>;
    /** Who is handling the conversation, from the session's metadata; null before a session starts and after it ends. */
    conversationStatus: Readonly<Ref<ConversationStatus | null>>;
    micMuted: Readonly<Ref<boolean>>;
    /** Starts a session, ending the one before; resolves to the conversation's id. */
    startSession(options: Omit<SessionOptions, keyof Callbacks>): Promise<string>;
    endSession(): Promise<void>;
    sendUserMessage(text: string, options?: SendOptions): Promise<MessageAck>;
    setMicMuted(muted: boolean): void;
    setVolume(options: {volume: number}): void;
    getInputVolume(): number;
    getOutputVolume(): number;
    /** The conversation's id, or "" outside a session. */
    getId(): string;
    getResumeToken(): string | null;
}

/**
 * A conversation with an agent for a Vue component. The session ends with the component (its effect scope). The app's
 * callbacks run as they would on the client, after the refs have changed.
 */
export function useConversation(callbacks: Callbacks = {}): UseConversation {
    const status = shallowRef<Status>("disconnected");
    const mode = shallowRef<Mode | null>(null);
    const micMuted = shallowRef(false);
    const conversationStatus = shallowRef<ConversationStatus | null>(null);
    let conversation: Conversation | null = null;
    /** Each start's number: a session's callbacks change the refs only while it is the newest. */
    let starts = 0;

    /** A session's callbacks: the refs change, then the app hears, only while it is the newest. */
    function ownCallbacks(start: number): Callbacks {
        const current = () => start === starts;
        const forwarded = Object.fromEntries(
            Object.entries(callbacks).map(([name, callback]) => [
                name,
                (...args: unknown[]) => {
                    if (current()) (callback as (...given: unknown[]) => void)(...args);
                },
            ]),
        ) as Callbacks;
        return {
            ...forwarded,
            onStatusChange: (change) => {
                if (!current()) return;
                status.value = change.status;
                callbacks.onStatusChange?.(change);
            },
            onModeChange: (change) => {
                if (!current()) return;
                mode.value = change.mode;
                callbacks.onModeChange?.(change);
            },
            onConversationStatus: (change) => {
                if (!current()) return;
                conversationStatus.value = change.status;
                callbacks.onConversationStatus?.(change);
            },
            onDisconnect: (details) => {
                if (!current()) return;
                mode.value = null;
                conversationStatus.value = null;
                conversation = null;
                callbacks.onDisconnect?.(details);
            },
        };
    }

    async function endSession(): Promise<void> {
        const ending = conversation;
        conversation = null;
        conversationStatus.value = null;
        await ending?.endSession();
    }

    async function startSession(options: Omit<SessionOptions, keyof Callbacks>): Promise<string> {
        const start = ++starts;
        // The session being replaced no longer reports its mode or status, so none shows until the new one has its own.
        mode.value = null;
        conversationStatus.value = null;
        const replaced = conversation;
        conversation = null;
        // Started before the old one ends, so its audio starts inside the caller's gesture, whatever the end takes.
        const starting = Conversation.startSession({...options, ...ownCallbacks(start)});
        void replaced?.endSession();
        const started = await starting;
        if (start !== starts) {
            // A newer start, or the component's end, came while this one waited.
            await started.endSession();
            throw new Error("A newer session replaced this one before it started.");
        }
        conversation = started;
        if (micMuted.value) started.setMicMuted(true);
        return started.getId();
    }

    if (getCurrentScope() !== undefined) {
        onScopeDispose(() => {
            starts++;
            void endSession();
        });
    }

    return {
        status: readonly(status),
        mode: readonly(mode),
        isSpeaking: computed(() => mode.value === "speaking"),
        conversationStatus: readonly(conversationStatus),
        micMuted: readonly(micMuted),
        startSession,
        endSession,
        sendUserMessage: (text, options) =>
            conversation?.sendUserMessage(text, options) ?? Promise.reject(new Error("Start a session before sending a message.")),
        setMicMuted: (muted) => {
            micMuted.value = muted;
            conversation?.setMicMuted(muted);
        },
        setVolume: (volume) => {
            conversation?.setVolume(volume);
        },
        getInputVolume: () => conversation?.getInputVolume() ?? 0,
        getOutputVolume: () => conversation?.getOutputVolume() ?? 0,
        getId: () => conversation?.getId() ?? "",
        getResumeToken: () => conversation?.getResumeToken() ?? null,
    };
}
