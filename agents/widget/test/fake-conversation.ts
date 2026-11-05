import {computed, defineComponent, ref} from "vue";
import type {Ref} from "vue";

export interface FakeSession {
    status: Ref<string>;
    mode: Ref<string | null>;
    micMuted: Ref<boolean>;
    conversationStatus: Ref<string | null>;
    isSpeaking: unknown;
    callbacks: Record<string, ((...args: never[]) => void) | undefined>;
    started: Record<string, unknown>[];
    sent: {text: string; options: Record<string, unknown>}[];
    feedback: unknown[];
    ended: number;
    /** What the next start does; connects by default. */
    startWith: (() => Promise<void>) | null;
    sendWith: (() => Promise<unknown>) | null;
    resumeToken: string | null;
    id: string;
    startSession: (options: Record<string, unknown>) => Promise<string>;
    endSession: () => Promise<void>;
    sendUserMessage: (text: string, options: Record<string, unknown>) => Promise<unknown>;
    sendFeedback: (eventId: number, score: string | null) => boolean;
    sendUserActivity: () => void;
    setMicMuted: (muted: boolean) => void;
    getInputVolume: () => number;
    getOutputVolume: () => number;
    getResumeToken: () => string | null;
    getId: () => string;
}

/** Every session the widget made, in order: its text session, then its call. */
export const sessions: FakeSession[] = [];

export function useConversation(callbacks: FakeSession["callbacks"] = {}): FakeSession {
    const session: FakeSession = {
        status: ref("disconnected"),
        mode: ref<string | null>(null),
        micMuted: ref(false),
        conversationStatus: ref<string | null>(null),
        isSpeaking: computed(() => false),
        callbacks,
        started: [],
        sent: [],
        feedback: [],
        ended: 0,
        startWith: null,
        sendWith: null,
        resumeToken: "resume-1",
        id: "conv_1",
        async startSession(options) {
            session.started.push(options);
            if (session.startWith !== null) await session.startWith();
            session.status.value = "connected";
            return session.id;
        },
        endSession() {
            session.ended += 1;
            session.status.value = "disconnected";
            return Promise.resolve();
        },
        sendUserMessage(text, options) {
            session.sent.push({text, options});
            if (session.sendWith !== null) return session.sendWith();
            return Promise.resolve({clientMessageId: options.clientMessageId, messageId: 100 + session.sent.length, occurredAt: "2026-11-05T10:00:00.000Z"});
        },
        sendFeedback(eventId, score) {
            session.feedback.push([eventId, score]);
            return true;
        },
        sendUserActivity: () => undefined,
        setMicMuted(muted) {
            session.micMuted.value = muted;
        },
        getInputVolume: () => 0,
        getOutputVolume: () => 0,
        getResumeToken: () => session.resumeToken,
        getId: () => session.id,
    };
    sessions.push(session);
    return session;
}

export const AgentOrb = defineComponent({name: "AgentOrb", props: {state: String, colors: Array, size: Number, level: Function}, render: () => null});
