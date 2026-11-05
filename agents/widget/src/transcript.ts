import type {HistoryMessage} from "@naiuz/agents-protocol";
import type {IncomingMessage} from "@naiuz/agents";
import type {Attachment, LogMessage, Quote} from "./settings";

/**
 * The conversation on the page. Everything the session says and the log gives goes through nextTranscript. A plain module,
 * so its tests run in Node. Lines stay in the order they arrived; the log only fills in what they lacked, older pages go
 * in front, and what came while the page was away goes before anything still being sent.
 */
export interface CustomerLine {
    kind: "customer";
    key: string;
    text: string;
    spoken: boolean;
    state: "sending" | "sent" | "failed";
    clientMessageId: string | null;
    messageId: number | null;
    attachments: Attachment[];
    replyTo: Quote | null;
    at: string | null;
}

export interface AgentLine {
    kind: "agent";
    key: string;
    /** The conversation the log says it's in; null for one said just now. */
    conversationId: string | null;
    eventId: number | null;
    messageId: number | null;
    text: string;
    streaming: boolean;
    feedback: "like" | "dislike" | null;
    attachments: Attachment[];
    replyTo: Quote | null;
    at: string | null;
}

export interface OperatorLine {
    kind: "operator";
    key: string;
    eventId: number | null;
    messageId: number | null;
    text: string;
    operator: {name: string | null; avatar_url: string | null};
    attachments: Attachment[];
    replyTo: Quote | null;
    at: string | null;
}

export type Notice = "waiting" | "joined" | "ended" | "transferred" | "no_balance";

export interface NoticeLine {
    kind: "notice";
    key: string;
    notice: Notice;
    name: string | null;
    avatarUrl: string | null;
}

export type Line = CustomerLine | AgentLine | OperatorLine | NoticeLine;

export interface Transcript {
    lines: Line[];
    /** The agent is writing, and no reply has started yet. */
    typing: boolean;
    next: number;
}

export const EMPTY_TRANSCRIPT: Transcript = {lines: [], typing: false, next: 1};

export type TranscriptEvent =
    | {type: "sending"; clientMessageId: string; text: string; replyTo?: Quote | null; attachments?: Attachment[]}
    | {type: "acked"; clientMessageId: string; messageId: number; at: string}
    | {type: "send_failed"; clientMessageId: string}
    | {type: "stored"; clientMessageId: string; message: LogMessage}
    | {type: "part"; eventId: number; part: "start" | "delta" | "stop"; text: string}
    | {type: "message"; message: IncomingMessage}
    | {type: "correction"; eventId: number; text: string}
    | {type: "typing"}
    | {type: "handoff"; reason: "agent" | "agent_failed" | "balance"}
    | {type: "ended"}
    | {type: "transferred"; name: string}
    | {type: "feedback"; key: string; score: "like" | "dislike" | null}
    | {type: "history"; messages: HistoryMessage[]}
    | {type: "log"; messages: LogMessage[]; earlier?: boolean};

/** The last line that passes, newest first, as a reply's event id can come round again after a quiet day. */
export function lastLine<Found extends Line>(lines: Line[], passes: (line: Line) => line is Found): Found | undefined {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (line !== undefined && passes(line)) return line;
    }
    return undefined;
}

function agentReply(lines: Line[], eventId: number): AgentLine | undefined {
    return lastLine(lines, (line): line is AgentLine => line.kind === "agent" && line.eventId === eventId);
}

function replacing(lines: Line[], line: Line, change: Partial<Line>): Line[] {
    return lines.map((other) => (other === line ? ({...other, ...change} as Line) : other));
}

function adding(state: Transcript, line: (key: string) => Line): Transcript {
    return {...state, lines: [...state.lines, line(`line-${String(state.next)}`)], next: state.next + 1};
}

function noticed(state: Transcript, notice: Notice, name: string | null = null, avatarUrl: string | null = null): Transcript {
    return adding(state, (key) => ({kind: "notice", key, notice, name, avatarUrl}));
}

function hasNotice(state: Transcript, notice: Notice): boolean {
    return state.lines.some((line) => line.kind === "notice" && line.notice === notice);
}

function fromLog(message: LogMessage, key: string): Line | null {
    const common = {
        key,
        messageId: message.id,
        text: message.content ?? "",
        attachments: message.attachments,
        replyTo: message.reply_to,
        at: message.created_at,
    };
    switch (message.sender_type) {
        case "customer":
            return {...common, kind: "customer", spoken: false, state: "sent", clientMessageId: message.client_message_id};
        case "ai":
            return {...common, kind: "agent", conversationId: message.conversation_id, eventId: message.event_id, streaming: false, feedback: message.feedback};
        case "operator":
            return {...common, kind: "operator", eventId: message.event_id, operator: message.operator ?? {name: null, avatar_url: null}};
        default:
            return null;
    }
}

/** The line a stored message already is on this page: by its id, its client id, its event, or a spoken line's words. */
function matchOf(lines: Line[], message: LogMessage): Line | undefined {
    const byId = lines.find((line) => line.kind !== "notice" && line.messageId === message.id);
    if (byId !== undefined) return byId;
    const unstored = lines.filter((line) => line.kind !== "notice" && line.messageId === null);
    if (message.sender_type === "customer") {
        return unstored.find(
            (line) =>
                line.kind === "customer" &&
                ((message.client_message_id !== null && line.clientMessageId === message.client_message_id) || (line.spoken && line.text === message.content)),
        );
    }
    if (message.sender_type === "ai") {
        return unstored.find((line) => line.kind === "agent" && line.eventId !== null && line.eventId === message.event_id);
    }
    return unstored.find((line) => line.kind === "operator" && line.text === message.content);
}

function withLog(state: Transcript, messages: LogMessage[], earlier: boolean): Transcript {
    let {lines, next} = state;
    const fresh: Line[] = [];
    for (const message of messages) {
        const line = fromLog(message, `line-${String(next)}`);
        if (line === null) continue;
        const known = matchOf(lines, message);
        if (known === undefined) {
            fresh.push(line);
            next += 1;
            continue;
        }
        // What only the log knows goes on the line the visitor already has; a reply being written stays as it is.
        lines = replacing(lines, known, known.kind === "agent" && known.streaming ? {messageId: message.id} : {...line, key: known.key, ...(known.kind === "customer" ? {spoken: known.spoken} : {})});
    }
    if (earlier) return {...state, lines: [...fresh, ...lines], next};
    const stillOut = lines.findIndex((line) => line.kind === "customer" && line.state !== "sent");
    const at = stillOut === -1 ? lines.length : stillOut;
    return {...state, lines: [...lines.slice(0, at), ...fresh, ...lines.slice(at)], next};
}

function withMessage(state: Transcript, message: IncomingMessage): Transcript {
    switch (message.source) {
        case "ai": {
            const reply = agentReply(state.lines, message.eventId);
            if (reply !== undefined) {
                return {...state, typing: false, lines: replacing(state.lines, reply, {text: message.message, streaming: false})};
            }
            return adding({...state, typing: false}, (key) => ({
                kind: "agent",
                key,
                conversationId: null,
                eventId: message.eventId,
                messageId: null,
                text: message.message,
                streaming: false,
                feedback: null,
                attachments: [],
                replyTo: null,
                at: null,
            }));
        }
        case "operator": {
            // The first to write is who joined.
            const joined = hasNotice(state, "joined") ? state : noticed(state, "joined", message.operator.name, message.operator.avatar_url);
            if (message.messageId !== null && joined.lines.some((line) => line.kind === "operator" && line.messageId === message.messageId)) return joined;
            return adding({...joined, typing: false}, (key) => ({
                kind: "operator",
                key,
                eventId: message.eventId,
                messageId: message.messageId,
                text: message.message,
                operator: message.operator,
                attachments: [],
                replyTo: null,
                at: null,
            }));
        }
        case "user": {
            if (message.spoken !== true && state.lines.some((line) => line.kind === "customer" && line.messageId === message.messageId)) return state;
            return adding(state, (key) => ({
                kind: "customer",
                key,
                text: message.message,
                spoken: message.spoken === true,
                state: "sent",
                clientMessageId: null,
                messageId: message.spoken === true ? null : message.messageId,
                attachments: [],
                replyTo: null,
                at: message.spoken === true ? message.occurredAt : null,
            }));
        }
    }
}

export function nextTranscript(state: Transcript, event: TranscriptEvent): Transcript {
    switch (event.type) {
        case "sending": {
            const failed = state.lines.find((line) => line.kind === "customer" && line.clientMessageId === event.clientMessageId);
            if (failed !== undefined) return {...state, lines: replacing(state.lines, failed, {state: "sending"})};
            return adding(state, (key) => ({
                kind: "customer",
                key,
                text: event.text,
                spoken: false,
                state: "sending",
                clientMessageId: event.clientMessageId,
                messageId: null,
                attachments: event.attachments ?? [],
                replyTo: event.replyTo ?? null,
                at: null,
            }));
        }
        case "acked":
        case "send_failed":
        case "stored": {
            const line = state.lines.find((other) => other.kind === "customer" && other.clientMessageId === event.clientMessageId);
            if (line === undefined) return state;
            const change: Partial<CustomerLine> =
                event.type === "acked"
                    ? {state: "sent", messageId: event.messageId, at: event.at}
                    : event.type === "stored"
                      ? {state: "sent", messageId: event.message.id, attachments: event.message.attachments, at: event.message.created_at}
                      : {state: "failed"};
            return {...state, lines: replacing(state.lines, line, change)};
        }
        case "part": {
            const reply = agentReply(state.lines, event.eventId);
            if (reply === undefined) {
                return adding({...state, typing: false}, (key) => ({
                    kind: "agent",
                    key,
                    conversationId: null,
                    eventId: event.eventId,
                    messageId: null,
                    text: event.text,
                    streaming: event.part !== "stop",
                    feedback: null,
                    attachments: [],
                    replyTo: null,
                    at: null,
                }));
            }
            return {
                ...state,
                typing: false,
                lines: replacing(state.lines, reply, {text: reply.text + event.text, streaming: event.part !== "stop"}),
            };
        }
        case "message":
            return withMessage(state, event.message);
        case "correction": {
            const reply = agentReply(state.lines, event.eventId);
            if (reply === undefined) return state;
            if (event.text === "") return {...state, lines: state.lines.filter((line) => line !== reply)};
            return {...state, lines: replacing(state.lines, reply, {text: event.text, streaming: false})};
        }
        case "typing":
            return {...state, typing: true};
        case "handoff":
            return noticed({...state, typing: false}, event.reason === "balance" ? "no_balance" : "waiting");
        case "ended":
            // What's said in the next conversation counts its events afresh, so these are past a thumb.
            return hasNotice(state, "ended") && state.lines.at(-1)?.kind === "notice"
                ? state
                : noticed({...state, typing: false, lines: state.lines.map((line) => (line.kind === "agent" ? {...line, eventId: null} : line))}, "ended");
        case "transferred":
            return noticed(state, "transferred", event.name);
        case "feedback":
            return {
                ...state,
                lines: state.lines.map((line) => (line.key === event.key && line.kind === "agent" ? {...line, feedback: event.score} : line)),
            };
        case "history": {
            const known = new Set(state.lines.flatMap((line) => (line.kind !== "notice" && line.messageId !== null ? [line.messageId] : [])));
            let next = state.next;
            const fresh: Line[] = [];
            for (const message of event.messages) {
                if (message.message_id !== null && known.has(message.message_id)) continue;
                const common = {key: `line-${String(next)}`, messageId: message.message_id, text: message.text, attachments: [], replyTo: null, at: message.at};
                next += 1;
                if (message.role === "customer") fresh.push({...common, kind: "customer", spoken: false, state: "sent", clientMessageId: message.client_message_id});
                else if (message.role === "agent") fresh.push({...common, kind: "agent", conversationId: null, eventId: null, streaming: false, feedback: null});
                else fresh.push({...common, kind: "operator", eventId: null, operator: {name: null, avatar_url: null}});
            }
            const unsent = state.lines.filter((line) => line.kind === "customer" && line.state !== "sent");
            const sent = state.lines.filter((line) => !unsent.includes(line));
            return {...state, lines: [...sent, ...fresh, ...unsent], next};
        }
        case "log":
            return withLog(state, event.messages, event.earlier === true);
    }
}

/** The newest stored message on the page, to ask the log what came after it. */
export function lastStoredId(state: Transcript): number | null {
    return state.lines.reduce<number | null>((newest, line) => {
        if (line.kind === "notice" || line.messageId === null) return newest;
        return newest === null || line.messageId > newest ? line.messageId : newest;
    }, null);
}

/** The oldest, to ask for the page before it. */
export function firstStoredId(state: Transcript): number | null {
    return state.lines.reduce<number | null>((oldest, line) => {
        if (line.kind === "notice" || line.messageId === null) return oldest;
        return oldest === null || line.messageId < oldest ? line.messageId : oldest;
    }, null);
}

/** The last thing said in a call, for the caption. */
export function lastSaid(state: Transcript): AgentLine | CustomerLine | null {
    return lastLine(state.lines, (line): line is AgentLine | CustomerLine => line.kind === "agent" || (line.kind === "customer" && line.spoken)) ?? null;
}
