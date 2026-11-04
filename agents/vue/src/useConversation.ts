import {ConversationController} from "@naiuz/agents";
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
    /** Ends the session. A start still on its way stops: it shows as disconnected at once, and closes when it arrives. */
    endSession(): Promise<void>;
    sendUserMessage(text: string, options?: SendOptions): Promise<MessageAck>;
    /** Tells the agent something without interrupting it, as information and never as instructions. */
    sendContextualUpdate(text: string, options?: {contextId?: string}): void;
    /** The customer is typing: a reply that hasn't started holds off for about 2 seconds. */
    sendUserActivity(): void;
    /** The customer's view of a reply, by its eventId. Null takes it back. */
    sendFeedback(eventId: number, score: "like" | "dislike" | null): void;
    setMicMuted(muted: boolean): void;
    setVolume(options: {volume: number}): void;
    getInputVolume(): number;
    getOutputVolume(): number;
    changeInputDevice(options: {deviceId: string}): Promise<void>;
    changeOutputDevice(options: {deviceId: string}): Promise<void>;
    /** The conversation's id, or "" outside a session. */
    getId(): string;
    getResumeToken(): string | null;
}

/**
 * A conversation with an agent for a Vue component. The session ends with the component (its effect scope). The app's
 * callbacks run as they would on the client, after the refs have changed.
 */
export function useConversation(callbacks: Callbacks = {}): UseConversation {
    const controller = new ConversationController(callbacks);
    const status = shallowRef<Status>("disconnected");
    const mode = shallowRef<Mode | null>(null);
    const micMuted = shallowRef(false);
    const conversationStatus = shallowRef<ConversationStatus | null>(null);

    controller.subscribe(() => {
        const state = controller.getSnapshot();
        status.value = state.status;
        mode.value = state.mode;
        conversationStatus.value = state.conversationStatus;
        micMuted.value = state.micMuted;
    });

    if (getCurrentScope() !== undefined) onScopeDispose(controller.dispose);

    return {
        status: readonly(status),
        mode: readonly(mode),
        isSpeaking: computed(() => mode.value === "speaking"),
        conversationStatus: readonly(conversationStatus),
        micMuted: readonly(micMuted),
        startSession: controller.startSession,
        endSession: controller.endSession,
        sendUserMessage: controller.sendUserMessage,
        sendContextualUpdate: controller.sendContextualUpdate,
        sendUserActivity: controller.sendUserActivity,
        sendFeedback: controller.sendFeedback,
        setMicMuted: controller.setMicMuted,
        setVolume: controller.setVolume,
        getInputVolume: controller.getInputVolume,
        getOutputVolume: controller.getOutputVolume,
        changeInputDevice: controller.changeInputDevice,
        changeOutputDevice: controller.changeOutputDevice,
        getId: controller.getId,
        getResumeToken: controller.getResumeToken,
    };
}
