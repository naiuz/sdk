import {ConversationController} from "@naiuz/agents";
import type {Callbacks, ConversationState, MessageAck, SendOptions, SessionOptions} from "@naiuz/agents";
import {useEffect, useInsertionEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";

/** What useConversation gives a component: the session's state, and its methods, whose identity never changes. */
export interface UseConversation extends ConversationState {
    isSpeaking: boolean;
    /** Starts a session, ending the one before; resolves to the conversation's id. Start a call from a click or a tap. */
    startSession(options: Omit<SessionOptions, keyof Callbacks>): Promise<string>;
    /** Ends the session. A start still on its way stops: it shows as disconnected at once, and closes when it arrives. */
    endSession(): Promise<void>;
    sendUserMessage(text: string, options?: SendOptions): Promise<MessageAck>;
    /** Tells the agent something without interrupting it, as information and never as instructions. */
    sendContextualUpdate(text: string, options?: {contextId?: string}): boolean;
    /** The customer is typing: a reply that hasn't started holds off for about 2 seconds. */
    sendUserActivity(): void;
    /** The customer's view of a reply, by its eventId. Null takes it back. */
    sendFeedback(eventId: number, score: "like" | "dislike" | null): boolean;
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
 * A conversation with an agent for a React component. The session ends with the component. The callbacks of the latest
 * render are the ones called, so they can close over props and state without a dependency list.
 */
export function useConversation(callbacks: Callbacks = {}): UseConversation {
    const latest = useRef(callbacks);
    // Before any effect of the same commit, which may start a session.
    useInsertionEffect(() => {
        latest.current = callbacks;
    });
    const [controller] = useState(() => new ConversationController(() => latest.current));
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

    // StrictMode runs this twice on mount: the controller stays usable after it.
    useEffect(() => controller.dispose, [controller]);

    return useMemo(
        () => ({
            ...state,
            isSpeaking: state.mode === "speaking",
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
        }),
        [state, controller],
    );
}
