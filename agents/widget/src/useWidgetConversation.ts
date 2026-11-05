import {MessageError, MicrophoneError, SessionError} from "@naiuz/agents";
import type {ClientToolHandler} from "@naiuz/agents";
import {useConversation} from "@naiuz/agents-vue";
import {computed, onScopeDispose, ref, shallowRef, watch} from "vue";
import type {Ref} from "vue";
import {WidgetApiError} from "./api";
import type {WidgetApi} from "./api";
import type {ContactDetails, Locale, Quote, WidgetSettings} from "./settings";
import type {WidgetStorage} from "./storage";
import {EMPTY_TRANSCRIPT, firstStoredId, lastStoredId, nextTranscript} from "./transcript";
import type {CustomerLine, Line, Transcript, TranscriptEvent} from "./transcript";

const POLL_EVERY_MS = 30_000;
const TYPING_FADES_AFTER_MS = 6_000;
const SEEN_AFTER_MS = 1_000;
/** How long a call that handed off gets to say its line, before it's ended from here. */
const HANDOFF_LINE_MS = 8_000;
const RECORD_SETTLES_MS = 1_500;
const OPEN_COUNTED_EVERY_MS = 30 * 60 * 1000;

export type CallProblem = "microphone" | "busy" | "balance" | "failed";

/**
 * A visitor's conversation: the text session a start opens, the call beside it on the same conversation, the log, and what
 * the launcher says while the panel is shut. Whatever ends a start on its way keeps it from opening anything after, as a
 * session that still connects would hold the microphone with no one watching.
 */
export function useWidgetConversation(options: {
    api: WidgetApi;
    storage: WidgetStorage;
    /** Whether this is a widget's key, with a visitor, a log and files. An agent's id has none of them. */
    hasVisitor: boolean;
    settings: Ref<WidgetSettings | null>;
    locale: Ref<Locale>;
    test: boolean;
    preview: boolean;
    isOpen: Ref<boolean>;
    clientTools: () => Record<string, ClientToolHandler> | undefined;
    dynamicVariables: () => Record<string, string | number | boolean> | undefined;
    onChime: () => void;
}) {
    const {api, storage, hasVisitor, settings, locale, isOpen} = options;

    const transcript = shallowRef<Transcript>(EMPTY_TRANSCRIPT);
    const failure = ref<"connect" | null>(null);
    const contactErrors = ref<Record<string, string>>({});
    const fileProblem = ref<"too_large" | "type" | "failed" | null>(null);
    const connecting = ref(false);
    const loadingLog = ref(false);
    const hasEarlier = ref(false);
    const operatorTyping = ref<{name: string | null; avatar_url: string | null} | null>(null);
    const unread = ref(0);
    const callProblem = ref<CallProblem | null>(null);
    const calling = ref(false);
    const callStartedAt = ref<number | null>(null);
    const handedOffInCall = ref(false);
    const callEnded = ref(false);

    let serverUrl: string | null = null;
    let starting: Promise<boolean> | null = null;
    let calls = 0;
    let disposed = false;
    let loaded = false;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    let logTimer: ReturnType<typeof setTimeout> | undefined;
    let seenTimer: ReturnType<typeof setTimeout> | undefined;
    let handoffTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    function apply(event: TranscriptEvent): void {
        transcript.value = nextTranscript(transcript.value, event);
    }

    function visible(): boolean {
        return isOpen.value && (typeof document === "undefined" || document.visibilityState !== "hidden");
    }

    /** Something the agent or an operator wrote: read if the panel's open, counted and chimed if not. */
    function arrived(): void {
        if (visible()) {
            markSeenSoon();
            return;
        }
        unread.value += 1;
        options.onChime();
    }

    function markSeenSoon(): void {
        const token = storage.visitorToken();
        if (!hasVisitor || token === null) return;
        clearTimeout(seenTimer);
        seenTimer = setTimeout(() => {
            void api.seen(token).catch(() => undefined);
        }, SEEN_AFTER_MS);
    }

    async function loadLog(position: {before?: number; after?: number} = {}): Promise<void> {
        const token = storage.visitorToken();
        if (!hasVisitor || token === null) return;
        try {
            const log = await api.messages(token, position);
            apply({type: "log", messages: log.messages, earlier: position.before !== undefined});
            if (position.after === undefined) hasEarlier.value = log.has_more;
        } catch {
            // What's on the page stays, and the socket goes on.
        }
    }

    /** What's in the log, once, as soon as the panel opens: the visitor needn't wait for the socket. */
    async function ensureLoaded(): Promise<void> {
        if (loaded) return;
        loaded = true;
        if (!hasVisitor || storage.visitorToken() === null) return;
        loadingLog.value = true;
        await loadLog();
        loadingLog.value = false;
    }

    async function loadEarlier(): Promise<void> {
        const first = firstStoredId(transcript.value);
        if (first !== null) await loadLog({before: first});
    }

    function catchUp(): void {
        const last = lastStoredId(transcript.value);
        void loadLog(last === null ? {} : {after: last});
    }

    /** A reply's stored id, which it can be quoted by, is in the log once its record has landed. */
    function readLogSoon(): void {
        clearTimeout(logTimer);
        logTimer = setTimeout(catchUp, RECORD_SETTLES_MS);
    }

    const chat = useConversation({
        onMessage: (message) => {
            apply({type: "message", message});
            if (message.source === "operator") {
                clearTimeout(typingTimer);
                operatorTyping.value = null;
                // Its files and quote are in the log.
                if (hasVisitor) catchUp();
            }
            if (message.source === "ai" || message.source === "operator") arrived();
            if (message.source === "ai" && hasVisitor) readLogSoon();
        },
        onAgentChatResponsePart: (part) => {
            apply({type: "part", eventId: part.eventId, part: part.type, text: part.text});
        },
        onAgentResponseCorrection: (correction) => {
            apply({type: "correction", eventId: correction.eventId, text: correction.text});
        },
        onAgentTyping: () => {
            apply({type: "typing"});
        },
        onOperatorTyping: ({operator}) => {
            operatorTyping.value = operator;
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                operatorTyping.value = null;
            }, TYPING_FADES_AFTER_MS);
        },
        onHandoff: ({reason}) => {
            apply({type: "handoff", reason});
            if (call.status.value !== "disconnected") {
                // The agent says its handoff line, then the call ends and the chat opens with the card.
                handedOffInCall.value = true;
                clearTimeout(handoffTimer);
                handoffTimer = setTimeout(() => void endCall(), HANDOFF_LINE_MS);
            }
        },
        onAgentTransferred: ({agentName}) => {
            apply({type: "transferred", name: agentName});
        },
        onHistory: (messages) => {
            if (hasVisitor) catchUp();
            else apply({type: "history", messages});
        },
        onDisconnect: (details) => {
            if (details.reason === "error" && !disposed) failure.value = "connect";
            // The server closes with 1000 once the conversation has ended.
            if (details.reason === "server" && details.code === 1000) apply({type: "ended"});
        },
    });

    const call = useConversation({
        // The first words of a call come before the text session is there, and a reply is one line whichever socket says it.
        onMessage: (message) => {
            if (message.source === "ai") apply({type: "message", message});
        },
        onDisconnect: () => {
            callStartedAt.value = null;
            callEnded.value = true;
            clearTimeout(handoffTimer);
        },
    });

    /** The newest resume token, each time the socket opens. The session only has it once its start has finished. */
    function keepSession(): void {
        const token = chat.getResumeToken();
        if (chat.status.value === "connected" && token !== null && serverUrl !== null) storage.setSession({token, url: serverUrl});
    }

    watch(chat.status, keepSession);

    function common() {
        const clientTools = options.clientTools();
        const dynamicVariables = options.dynamicVariables();
        return {
            textOnly: true,
            ...(clientTools === undefined ? {} : {clientTools}),
            ...(dynamicVariables === undefined ? {} : {dynamicVariables}),
            // The chip is a widget's own, within the agent's languages; an agent's id has only what the agent allows.
            ...(hasVisitor && settings.value?.languages.includes(locale.value) === true ? {overrides: {language: locale.value}} : {}),
        };
    }

    async function open(contact: ContactDetails): Promise<boolean> {
        connecting.value = true;
        failure.value = null;
        contactErrors.value = {};
        try {
            const kept = storage.session();
            if (kept !== null && Object.keys(contact).length === 0) {
                try {
                    serverUrl = kept.url;
                    await chat.startSession({...common(), token: kept.token, serverUrl: kept.url});
                    keepSession();
                    return !disposed;
                } catch (error) {
                    // Past its life: a new session finds the same visitor. Anything else says nothing against it.
                    if (!(error instanceof SessionError && error.code === 4001)) throw error;
                    storage.forgetSession();
                }
            }
            const issued = await api.session({mode: "text", visitorToken: storage.visitorToken(), contact, test: options.test});
            if (issued.visitor_token !== undefined) storage.setVisitorToken(issued.visitor_token);
            serverUrl = issued.url;
            if (disposed) return false;
            await chat.startSession({...common(), token: issued.token, serverUrl: issued.url});
            keepSession();
            return !disposed;
        } catch (error) {
            if (error instanceof WidgetApiError && error.status === 422) contactErrors.value = error.fields;
            else if (!disposed) failure.value = "connect";
            return false;
        } finally {
            connecting.value = false;
        }
    }

    /** The conversation's socket, opening one if there's none. Says whether it's there. */
    function startChat(contact: ContactDetails = {}): Promise<boolean> {
        if (chat.status.value === "connected" || chat.status.value === "reconnecting") return Promise.resolve(true);
        starting ??= open(contact).finally(() => {
            starting = null;
        });
        return starting;
    }

    async function deliver(clientMessageId: string, text: string, replyToMessageId: number | null): Promise<void> {
        try {
            if (!(await startChat())) throw new MessageError(clientMessageId, true, "unavailable");
            const ack = await chat.sendUserMessage(text, {clientMessageId, ...(replyToMessageId === null ? {} : {replyToMessageId})});
            apply({type: "acked", clientMessageId, messageId: ack.messageId, at: ack.occurredAt});
        } catch {
            apply({type: "send_failed", clientMessageId});
        }
    }

    /** Shows the message at once, and turns it into Not sent if the server refuses it or the connection drops first. */
    async function send(text: string, replyTo: Quote | null = null): Promise<void> {
        const message = text.trim();
        if (message === "") return;
        const clientMessageId = globalThis.crypto.randomUUID();
        apply({type: "sending", clientMessageId, text: message, replyTo});
        await deliver(clientMessageId, message, replyTo?.id ?? null);
    }

    const filesAwaitingRetry = new Map<string, {file: File; caption: string | null; replyTo: number | null}>();

    async function upload(clientMessageId: string, file: File, caption: string | null, replyTo: number | null): Promise<void> {
        fileProblem.value = null;
        try {
            if (!(await startChat())) throw new Error("no session");
            const token = chat.getResumeToken();
            const conversationId = chat.getId();
            if (token === null || conversationId === "") throw new Error("no session");
            const message = await api.upload(conversationId, token, file, {clientMessageId, caption, replyToMessageId: replyTo});
            filesAwaitingRetry.delete(clientMessageId);
            apply({type: "stored", clientMessageId, message});
        } catch (error) {
            filesAwaitingRetry.set(clientMessageId, {file, caption, replyTo});
            fileProblem.value = error instanceof WidgetApiError && error.status === 422 ? "type" : "failed";
            apply({type: "send_failed", clientMessageId});
        }
    }

    async function sendFile(file: File, caption: string | null, replyTo: Quote | null = null): Promise<void> {
        if (file.size > 10 * 1024 * 1024) {
            fileProblem.value = "too_large";
            return;
        }
        const clientMessageId = globalThis.crypto.randomUUID();
        apply({
            type: "sending",
            clientMessageId,
            text: caption ?? "",
            replyTo,
            attachments: [{id: 0, file_name: file.name, file_type: file.type, file_size: file.size}],
        });
        await upload(clientMessageId, file, caption, replyTo?.id ?? null);
    }

    /** Sends what failed again, with its own id, so it never doubles. */
    async function retry(line: CustomerLine): Promise<void> {
        if (line.clientMessageId === null) return;
        apply({type: "sending", clientMessageId: line.clientMessageId, text: line.text});
        const file = filesAwaitingRetry.get(line.clientMessageId);
        if (file !== undefined) await upload(line.clientMessageId, file.file, file.caption, file.replyTo);
        else await deliver(line.clientMessageId, line.text, line.replyTo?.id ?? null);
    }

    function sendFeedback(line: Extract<Line, {kind: "agent"}>, score: "like" | "dislike"): void {
        if (line.eventId === null) return;
        const next = line.feedback === score ? null : score;
        if (chat.sendFeedback(line.eventId, next)) apply({type: "feedback", key: line.key, score: next});
    }

    /** The session a call opens the conversation with, so the agent greets by voice. The text session follows on its token. */
    async function openWithCall(contact: ContactDetails): Promise<void> {
        const issued = await api.session({mode: "voice", visitorToken: storage.visitorToken(), contact, test: options.test});
        if (issued.visitor_token !== undefined) storage.setVisitorToken(issued.visitor_token);
        serverUrl = issued.url;
        await call.startSession({...common(), textOnly: false, token: issued.token, serverUrl: issued.url});
        const token = call.getResumeToken();
        if (token !== null && !disposed) {
            await chat.startSession({...common(), token, serverUrl: issued.url}).catch(() => undefined);
            keepSession();
        }
    }

    /**
     * A call on the conversation, as a second connection beside the text session, which goes on hearing every turn. With
     * neither open and nothing to go on with, the call is what opens it. Says whether it got as far as a call.
     */
    async function startCall(contact: ContactDetails = {}): Promise<boolean> {
        if (calling.value || call.status.value !== "disconnected" || disposed) return false;
        const number = ++calls;
        const current = () => number === calls && !disposed;
        calling.value = true;
        callProblem.value = null;
        callEnded.value = false;
        handedOffInCall.value = false;
        contactErrors.value = {};
        try {
            if (chat.status.value === "disconnected" && storage.session() === null) {
                await openWithCall(contact);
            } else {
                if (!(await startChat())) {
                    if (current()) callProblem.value = "failed";
                    return false;
                }
                // Read now: a reconnect on the way renews it.
                const token = chat.getResumeToken();
                if (!current() || token === null || serverUrl === null) return false;
                await call.startSession({token, serverUrl, textOnly: false});
            }
            if (current()) callStartedAt.value = Date.now();
            return true;
        } catch (error) {
            // A start ended on its way says nothing.
            if (!current()) return false;
            if (error instanceof WidgetApiError && error.status === 422) contactErrors.value = error.fields;
            else if (error instanceof WidgetApiError && error.status === 402) callProblem.value = "balance";
            else if (error instanceof MicrophoneError) callProblem.value = "microphone";
            else if (error instanceof SessionError && error.code === 4009) callProblem.value = "busy";
            else if (error instanceof SessionError && error.code === 4010) callProblem.value = "balance";
            else callProblem.value = "failed";
            return false;
        } finally {
            if (number === calls) calling.value = false;
        }
    }

    /** Ends the call, or stops one still on its way. */
    async function endCall(): Promise<void> {
        calls += 1;
        calling.value = false;
        callStartedAt.value = null;
        clearTimeout(handoffTimer);
        await call.endSession();
    }

    /** A new language for what comes next: a live session goes on in it. */
    async function languageChanged(): Promise<void> {
        const token = chat.getResumeToken();
        if (!hasVisitor || chat.status.value !== "connected" || token === null || serverUrl === null) return;
        try {
            await chat.endSession();
            await chat.startSession({...common(), token, serverUrl});
            keepSession();
        } catch {
            failure.value = "connect";
        }
    }

    function stopPolling(): void {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }

    /** With the panel shut and no socket, the launcher still hears of replies, if a little late. */
    function poll(): void {
        const token = storage.visitorToken();
        if (!hasVisitor || token === null || chat.status.value !== "disconnected" || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
        void api.unread(token).then(
            (count) => {
                if (count > unread.value) options.onChime();
                if (!isOpen.value) unread.value = count;
            },
            () => undefined,
        );
    }

    function countOpen(): void {
        if (!hasVisitor) return;
        const now = Date.now();
        const last = storage.lastOpenedAt();
        if (last !== null && last <= now && now - last < OPEN_COUNTED_EVERY_MS) return;
        storage.setLastOpenedAt(now);
        api.opened();
    }

    if (!options.preview) {
        watch(
            isOpen,
            (opened) => {
                stopPolling();
                if (opened) {
                    unread.value = 0;
                    countOpen();
                    markSeenSoon();
                    void ensureLoaded();
                } else if (hasVisitor && storage.visitorToken() !== null) {
                    pollTimer = setInterval(poll, POLL_EVERY_MS);
                }
            },
            {immediate: true},
        );
    }

    onScopeDispose(() => {
        disposed = true;
        calls += 1;
        stopPolling();
        clearTimeout(typingTimer);
        clearTimeout(logTimer);
        clearTimeout(seenTimer);
        clearTimeout(handoffTimer);
    });

    return {
        transcript,
        failure,
        contactErrors,
        fileProblem,
        connecting,
        loadingLog,
        hasEarlier,
        operatorTyping,
        unread,
        conversationStatus: chat.conversationStatus,
        chatStatus: chat.status,
        conversationId: () => chat.getId(),
        startChat,
        loadEarlier,
        send,
        sendFile,
        retry,
        sendFeedback,
        sendUserActivity: () => {
            chat.sendUserActivity();
        },
        languageChanged,
        callProblem,
        calling,
        callStartedAt,
        callEnded,
        handedOffInCall,
        callLive: computed(() => call.status.value !== "disconnected"),
        agentMode: call.mode,
        muted: call.micMuted,
        startCall,
        endCall,
        setMuted: (muted: boolean) => {
            call.setMicMuted(muted);
        },
        getInputVolume: () => call.getInputVolume(),
        getOutputVolume: () => call.getOutputVolume(),
    };
}

export type WidgetConversation = ReturnType<typeof useWidgetConversation>;
