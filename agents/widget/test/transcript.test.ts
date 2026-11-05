import {describe, expect, test} from "vitest";
import type {LogMessage} from "../src/settings";
import {EMPTY_TRANSCRIPT, firstStoredId, lastSaid, lastStoredId, nextTranscript} from "../src/transcript";
import type {Transcript, TranscriptEvent} from "../src/transcript";

const play = (...events: TranscriptEvent[]): Transcript => events.reduce(nextTranscript, EMPTY_TRANSCRIPT);
const texts = (state: Transcript) => state.lines.map((line) => (line.kind === "notice" ? `[${line.notice}]` : line.text));

function logged(id: number, change: Partial<LogMessage> = {}): LogMessage {
    return {id, conversation_id: "conv_1", client_message_id: null, event_id: null, feedback: null, operator: null, sender_type: "ai", content: `m${String(id)}`, reply_to: null, attachments: [], created_at: "2026-11-05T10:00:00Z", ...change};
}

const operator = {name: "Dilshod", avatar_url: null};

describe("a visitor's message", () => {
    test("shows at once, then is stored", () => {
        const state = play({type: "sending", clientMessageId: "c1", text: "Salom"}, {type: "acked", clientMessageId: "c1", messageId: 5, at: "t"});
        expect(state.lines[0]).toMatchObject({kind: "customer", text: "Salom", state: "sent", messageId: 5});
    });

    test("turns into Not sent, and a retry stays one line", () => {
        const failed = play({type: "sending", clientMessageId: "c1", text: "Salom"}, {type: "send_failed", clientMessageId: "c1"});
        expect(failed.lines[0]).toMatchObject({state: "failed"});
        const again = nextTranscript(failed, {type: "sending", clientMessageId: "c1", text: "Salom"});
        expect(again.lines).toHaveLength(1);
        expect(again.lines[0]).toMatchObject({state: "sending"});
    });
});

describe("a reply", () => {
    test("streams, then its final text wins", () => {
        const state = play(
            {type: "typing"},
            {type: "part", eventId: 2, part: "start", text: ""},
            {type: "part", eventId: 2, part: "delta", text: "Sal"},
            {type: "part", eventId: 2, part: "delta", text: "om"},
        );
        expect(state.typing).toBe(false);
        expect(state.lines[0]).toMatchObject({text: "Salom", streaming: true});
        const done = nextTranscript(state, {type: "message", message: {source: "ai", message: "Salom!", eventId: 2}});
        expect(done.lines).toHaveLength(1);
        expect(done.lines[0]).toMatchObject({text: "Salom!", streaming: false});
    });

    test("an empty correction withdraws it, and another replaces it", () => {
        const start: TranscriptEvent = {type: "part", eventId: 2, part: "delta", text: "Yomon"};
        expect(play(start, {type: "correction", eventId: 2, text: ""}).lines).toEqual([]);
        expect(play(start, {type: "correction", eventId: 2, text: "Yaxshi"}).lines[0]).toMatchObject({text: "Yaxshi", streaming: false});
    });

    test("a thumb goes on its line", () => {
        const state = play({type: "message", message: {source: "ai", message: "Salom", eventId: 2}});
        const key = state.lines[0]?.key ?? "";
        expect(nextTranscript(state, {type: "feedback", key, score: "like"}).lines[0]).toMatchObject({feedback: "like"});
    });
});

describe("operators", () => {
    const reply = (eventId: number, messageId: number | null): TranscriptEvent => ({type: "message", message: {source: "operator", message: "Javob", eventId, operator, messageId}});

    test("a handoff says someone will reply, and the first to write joined, once", () => {
        const state = play({type: "handoff", reason: "agent"}, reply(3, 7), reply(4, 8));
        expect(texts(state)).toEqual(["[waiting]", "[joined]", "Javob", "Javob"]);
        expect(state.lines[1]).toMatchObject({name: "Dilshod"});
    });

    test("the same stored reply twice is one line", () => {
        expect(play(reply(3, 7), reply(3, 7)).lines.filter((line) => line.kind === "operator")).toHaveLength(1);
    });
});

describe("the log", () => {
    test("fills in what a live line lacked, by its client id or its event", () => {
        const state = play(
            {type: "sending", clientMessageId: "c1", text: "Mana"},
            {type: "acked", clientMessageId: "c1", messageId: 5, at: "t"},
            {type: "message", message: {source: "ai", message: "Rahmat", eventId: 9}},
            {type: "log", messages: [
                logged(5, {sender_type: "customer", content: "Mana", client_message_id: "c1", attachments: [{id: 1, file_name: "a.png", file_type: "image/png", file_size: 1}]}),
                logged(6, {content: "Rahmat", event_id: 9, feedback: "like"}),
            ]},
        );
        expect(state.lines).toHaveLength(2);
        expect(state.lines[0]).toMatchObject({attachments: [{file_name: "a.png"}]});
        expect(state.lines[1]).toMatchObject({messageId: 6, feedback: "like"});
    });

    test("doesn't break a reply still being written", () => {
        const state = play({type: "part", eventId: 9, part: "delta", text: "Yozil"}, {type: "log", messages: [logged(6, {content: "Yozilgan", event_id: 9})]});
        expect(state.lines[0]).toMatchObject({text: "Yozil", streaming: true, messageId: 6});
    });

    test("an older page goes in front, and what came while away goes before anything still going out", () => {
        const state = play(
            {type: "log", messages: [logged(5)]},
            {type: "sending", clientMessageId: "c1", text: "Hali"},
            {type: "log", messages: [logged(6)]},
            {type: "log", messages: [logged(4)], earlier: true},
        );
        expect(texts(state)).toEqual(["m4", "m5", "m6", "Hali"]);
        expect([firstStoredId(state), lastStoredId(state)]).toEqual([4, 6]);
    });

    test("a spoken line is matched by its words, so a refresh doesn't double it", () => {
        const state = play(
            {type: "message", message: {source: "user", message: "Salom", spoken: true, language: "uz", occurredAt: "t"}},
            {type: "log", messages: [logged(5, {sender_type: "customer", content: "Salom"})]},
        );
        expect(state.lines).toHaveLength(1);
        expect(state.lines[0]).toMatchObject({spoken: true, messageId: 5});
    });

    test("leaves out what isn't for a customer", () => {
        expect(play({type: "log", messages: [logged(5, {sender_type: "system"})]}).lines).toEqual([]);
    });
});

describe("the protocol's history, for an element with no log", () => {
    test("adds what's new, and keeps what's still going out last", () => {
        const history = [
            {role: "customer" as const, text: "Salom", at: "t", message_id: 1, client_message_id: "c0"},
            {role: "agent" as const, text: "Va alaykum", at: "t", message_id: 2, client_message_id: null},
        ];
        const state = play({type: "sending", clientMessageId: "c1", text: "Hali"}, {type: "history", messages: history}, {type: "history", messages: history});
        expect(texts(state)).toEqual(["Salom", "Va alaykum", "Hali"]);
    });
});

describe("a visitor back after an earlier conversation", () => {
    test("a reply that reuses an old conversation's event id is a line of its own", () => {
        const state = play(
            {type: "log", messages: [logged(1, {content: "Yesterday's greeting", event_id: 1, conversation_id: "conv_0"}), logged(2, {content: "Yesterday's answer", event_id: 2, conversation_id: "conv_0"})]},
            {type: "message", message: {source: "ai", message: "Today's greeting", eventId: 1}},
            {type: "part", eventId: 2, part: "delta", text: "Today"},
            {type: "correction", eventId: 2, text: "Today's answer"},
        );
        expect(texts(state)).toEqual(["Yesterday's greeting", "Yesterday's answer", "Today's greeting", "Today's answer"]);
    });

    test("a stored message of an earlier conversation doesn't take a live line, and its own does", () => {
        const state = play(
            {type: "message", message: {source: "ai", message: "Today's greeting", eventId: 1}},
            {type: "log", conversation: "conv_1", messages: [logged(1, {content: "Yesterday's greeting", event_id: 1, conversation_id: "conv_0"})]},
        );
        expect(texts(state)).toEqual(["Yesterday's greeting", "Today's greeting"]);
        expect(state.lines[1]).toMatchObject({messageId: null});

        const stored = nextTranscript(state, {type: "log", conversation: "conv_1", messages: [logged(2, {content: "Today's greeting", event_id: 1, conversation_id: "conv_1"})]});
        expect(texts(stored)).toEqual(["Yesterday's greeting", "Today's greeting"]);
        expect(stored.lines[1]).toMatchObject({messageId: 2});
    });

    test("a reply stored after its conversation ended isn't said twice", () => {
        const state = play(
            {type: "message", message: {source: "ai", message: "Xayr", eventId: 7}},
            {type: "ended"},
            {type: "log", conversation: "conv_2", messages: [logged(3, {content: "Xayr", event_id: 7, conversation_id: "conv_1"})]},
        );
        expect(texts(state)).toEqual(["Xayr", "[ended]"]);
    });
});

describe("a dropped connection", () => {
    test("stops a cut reply's caret, and the log gives the rest", () => {
        const state = play({type: "part", eventId: 3, part: "delta", text: "Yarim"}, {type: "cut"});
        expect(state.lines[0]).toMatchObject({text: "Yarim", streaming: false});

        const stored = nextTranscript(state, {type: "log", conversation: "conv_1", messages: [logged(4, {content: "Yarim emas, butun gap", event_id: 3})]});
        expect(stored.lines).toHaveLength(1);
        expect(stored.lines[0]).toMatchObject({text: "Yarim emas, butun gap", messageId: 4, streaming: false});
    });

    test("a reconnect with no log doesn't double what the agent said, and mends what was cut", () => {
        const history = [
            {role: "customer" as const, text: "Salom", at: "t", message_id: 5, client_message_id: "c1"},
            {role: "agent" as const, text: "Va alaykum", at: "t", message_id: 6, client_message_id: null},
            {role: "agent" as const, text: "Yarim emas, butun gap", at: "t", message_id: 7, client_message_id: null},
        ];
        const state = play(
            {type: "sending", clientMessageId: "c1", text: "Salom"},
            {type: "acked", clientMessageId: "c1", messageId: 5, at: "t"},
            {type: "message", message: {source: "ai", message: "Va alaykum", eventId: 1}},
            {type: "part", eventId: 2, part: "delta", text: "Yarim"},
            {type: "cut"},
            {type: "history", messages: history},
        );
        expect(texts(state)).toEqual(["Salom", "Va alaykum", "Yarim emas, butun gap"]);
        expect(texts(nextTranscript(state, {type: "history", messages: history}))).toEqual(["Salom", "Va alaykum", "Yarim emas, butun gap"]);
    });
});

test("the end of a conversation says so, once", () => {
    expect(texts(play({type: "ended"}, {type: "ended"}))).toEqual(["[ended]"]);
});

test("what was said before the end is past a thumb, as the next conversation counts its events afresh", () => {
    const state = play({type: "message", message: {source: "ai", message: "Salom", eventId: 2}}, {type: "ended"});
    expect(state.lines[0]).toMatchObject({eventId: null});
});

test("the caption follows the last thing said, the visitor's too", () => {
    const state = play({type: "message", message: {source: "ai", message: "Salom", eventId: 1}}, {type: "message", message: {source: "user", message: "Rahmat", spoken: true, language: "uz", occurredAt: "t"}});
    expect(lastSaid(state)).toMatchObject({text: "Rahmat"});
    expect(lastSaid(EMPTY_TRANSCRIPT)).toBeNull();
});
