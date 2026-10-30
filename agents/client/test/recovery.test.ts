import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {Conversation} from "../src/index";
import {connected, fakeSockets, ids, metadata} from "./fake-socket";
import {loadFixture, replay} from "./replay";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function userMessages(sent: unknown[]): string[] {
    return sent.filter((frame) => (frame as {type: string}).type === "user_message").map((frame) => (frame as {client_message_id: string}).client_message_id);
}

describe("closes that resume", () => {
    test.each([1001, 1012, 1013])("close %i reconnects with the resume token", async (code) => {
        const {sockets, conversation} = await connected();
        sockets.socket.serverCloses(code, "x");
        expect(conversation.status).toBe("reconnecting");
        await vi.advanceTimersByTimeAsync(250);
        expect(sockets.opened).toBe(2);
        expect(sockets.socket.url).toContain("token=resume-1");
    });

    test("a 4012 before the metadata connects again with the same token", async () => {
        const sockets = fakeSockets();
        const started = Conversation.startSession({token: "session-token", WebSocket: sockets.factory});
        sockets.socket.open();
        sockets.socket.serverCloses(4012, "draining");
        await vi.advanceTimersByTimeAsync(250);
        expect(sockets.opened).toBe(2);
        expect(sockets.socket.url).toContain("token=session-token");
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        await expect(started).resolves.toBeInstanceOf(Conversation);
    });

    test("any other close before the metadata still rejects at once", async () => {
        const sockets = fakeSockets();
        const started = Conversation.startSession({token: "session-token", WebSocket: sockets.factory});
        sockets.socket.open();
        sockets.socket.serverCloses(1011, "internal_error");
        await expect(started).rejects.toMatchObject({code: 1011});
        await vi.advanceTimersByTimeAsync(10_000);
        expect(sockets.opened).toBe(1);
    });
});

describe("sends always settle", () => {
    test("a send after the app ended the session rejects at once, and isn't retryable", async () => {
        const {conversation, socket} = await connected({idGenerator: ids("c-1")});
        await conversation.endSession();
        await expect(conversation.sendUserMessage("Salom")).rejects.toMatchObject({clientMessageId: "c-1", retryable: false, code: "unavailable"});
        expect(userMessages(socket.sentJson())).toEqual([]);
    });

    test("a send after the client gave up reconnecting rejects at once, as retryable", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0.999);
        const {sockets, conversation} = await connected({idGenerator: ids("c-1")});
        sockets.socket.serverCloses(1006, "");
        for (let attempt = 0; attempt < 10; attempt++) {
            await vi.advanceTimersByTimeAsync(8000);
            sockets.socket.serverCloses(1006, "");
        }
        expect(conversation.status).toBe("disconnected");
        await expect(conversation.sendUserMessage("Salom")).rejects.toMatchObject({retryable: true, code: "unavailable"});
    });

    test.each([
        ["an empty text", "", undefined],
        ["a text over 10,000 characters", "a".repeat(10_001), undefined],
        ["a malformed id", "Salom", "not an id!"],
    ])("%s rejects as invalid, and nothing is sent", async (_, text, clientMessageId) => {
        const {conversation, socket} = await connected({idGenerator: ids("c-1")});
        const sending = conversation.sendUserMessage(text, clientMessageId === undefined ? {} : {clientMessageId});
        await expect(sending).rejects.toMatchObject({retryable: false, code: "invalid"});
        expect(userMessages(socket.sentJson())).toEqual([]);
    });

    test("the length counts characters, not UTF-16 units", async () => {
        const {conversation, socket} = await connected({idGenerator: ids("c-1")});
        void conversation.sendUserMessage("😀".repeat(10_000));
        expect(userMessages(socket.sentJson())).toEqual(["c-1"]);
    });
});

describe("recovering from a long drop", () => {
    test("reconnects ten times, the pause doubling up to 8 seconds", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0.999);
        const {sockets, conversation, calls} = await connected({idGenerator: ids("c-1")});
        sockets.socket.serverCloses(1006, "");
        const pauses = [250, 500, 1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000];
        for (const [attempt, pause] of pauses.entries()) {
            await vi.advanceTimersByTimeAsync(pause - 10);
            expect(sockets.opened).toBe(attempt + 1);
            await vi.advanceTimersByTimeAsync(10);
            expect(sockets.opened).toBe(attempt + 2);
            sockets.socket.serverCloses(1006, "");
        }
        expect(conversation.status).toBe("disconnected");
        expect(calls.onDisconnect.at(-1)?.[0]).toMatchObject({reason: "error", code: 1006});
    });

    test("each pause is jittered down to half its length", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        const {sockets} = await connected();
        sockets.socket.serverCloses(1006, "");
        await vi.advanceTimersByTimeAsync(124);
        expect(sockets.opened).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(sockets.opened).toBe(2);
    });

    test("getResumeToken returns the newest resume token, for resuming after a page reload", async () => {
        const {sockets, conversation} = await connected();
        expect(conversation.getResumeToken()).toBe("resume-1");
        sockets.socket.serverCloses(4012, "draining");
        await vi.advanceTimersByTimeAsync(250);
        sockets.socket.open();
        sockets.socket.serverSends(metadata("resume-2"));
        expect(conversation.getResumeToken()).toBe("resume-2");
    });

    test("a failed message is sent again with its own id, and a send of a waiting id waits with it", async () => {
        const {conversation, socket} = await connected({idGenerator: ids("c-1")});
        const first = conversation.sendUserMessage("Salom", {clientMessageId: "c-9"});
        const again = conversation.sendUserMessage("Salom", {clientMessageId: "c-9"});
        expect(again).toBe(first);
        expect(userMessages(socket.sentJson())).toEqual(["c-9"]);
        socket.serverSends({type: "message_ack", client_message_id: "c-9", message_id: 981, occurred_at: "2026-10-30T09:15:02.120Z"});
        await expect(first).resolves.toMatchObject({clientMessageId: "c-9", messageId: 981});
    });

    test("a message waiting when the app ends the session fails as not retryable", async () => {
        const {conversation} = await connected({idGenerator: ids("c-1")});
        const sending = conversation.sendUserMessage("Salom");
        sending.catch(() => undefined);
        await conversation.endSession();
        await expect(sending).rejects.toMatchObject({retryable: false});
    });

    test.each([4003, 4029, 1000])("a message waiting at a final close %i fails as not retryable", async (code) => {
        const {conversation, socket} = await connected({idGenerator: ids("c-1")});
        const sending = conversation.sendUserMessage("Salom");
        sending.catch(() => undefined);
        socket.serverCloses(code, "x");
        await expect(sending).rejects.toMatchObject({retryable: false});
    });
});

describe("echoes", () => {
    test("the echo of a message this client sent is dropped", async () => {
        const {conversation, socket, calls} = await connected({idGenerator: ids("c-1")});
        void conversation.sendUserMessage("Salom");
        socket.serverSends({type: "user_message", client_message_id: "c-1", message_id: 981, text: "Salom", occurred_at: "2026-10-30T09:15:02.120Z"});
        expect(calls.onMessage).toEqual([]);
    });

    test("another viewer's message arrives once, however often the server sends it", async () => {
        const {socket, calls} = await connected();
        const echo = {type: "user_message", client_message_id: "c-7", message_id: 982, text: "Rahmat!", occurred_at: "2026-10-30T09:15:10.000Z"};
        socket.serverSends(echo);
        socket.serverSends(echo);
        expect(calls.onMessage).toEqual([[{source: "user", message: "Rahmat!", messageId: 982}]]);
    });

    test("a message the history showed isn't delivered again", async () => {
        const {socket, calls} = await connected();
        socket.serverSends({type: "conversation_history", messages: [{role: "customer", text: "Rahmat!", at: "2026-10-30T09:15:10.000Z", message_id: 982, client_message_id: "c-7"}]});
        socket.serverSends({type: "user_message", client_message_id: "c-7", message_id: 982, text: "Rahmat!", occurred_at: "2026-10-30T09:15:10.000Z"});
        expect(calls.onMessage).toEqual([]);
    });
});

describe("the history after a lost ack", () => {
    test("a waiting message the history shows saved is acked from it, and not sent again", async () => {
        const {sent, acks, errors} = await replay(loadFixture("draining"), {then: loadFixture("resumed-after-lost-ack"), idGenerator: ids("c-1")});
        expect(userMessages(sent)).toEqual(["c-1"]);
        expect(acks).toEqual([{clientMessageId: "c-1", messageId: 981, occurredAt: "2026-10-30T09:15:05.000Z"}]);
        expect(errors).toEqual([]);
    });
});

describe("a silent socket", () => {
    test("is given up after 40 seconds, and the session resumes", async () => {
        const {sockets, conversation} = await connected();
        await vi.advanceTimersByTimeAsync(39_999);
        expect(conversation.status).toBe("connected");
        await vi.advanceTimersByTimeAsync(1);
        expect(conversation.status).toBe("reconnecting");
        expect(sockets.all[0]?.readyState).toBe(3);
        await vi.advanceTimersByTimeAsync(250);
        expect(sockets.opened).toBe(2);
        expect(sockets.socket.url).toContain("token=resume-1");
    });

    test("any frame keeps it alive", async () => {
        const {sockets, conversation} = await connected();
        await vi.advanceTimersByTimeAsync(30_000);
        sockets.socket.serverSends({type: "ping", event_id: 1});
        await vi.advanceTimersByTimeAsync(30_000);
        expect(conversation.status).toBe("connected");
        expect(sockets.opened).toBe(1);
    });

    test("a handshake the server never answers fails the start after 40 seconds", async () => {
        const sockets = fakeSockets();
        const started = Conversation.startSession({token: "session-token", WebSocket: sockets.factory});
        started.catch(() => undefined);
        sockets.socket.open();
        await vi.advanceTimersByTimeAsync(40_000);
        await expect(started).rejects.toMatchObject({code: 1006});
    });

    test("after conversation_ended, a socket that never closes ends the session instead of resuming", async () => {
        const {sockets, conversation, calls} = await connected();
        sockets.socket.serverSends({type: "conversation_ended", reason: "resolved"});
        await vi.advanceTimersByTimeAsync(40_000);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(sockets.opened).toBe(1);
        expect(conversation.status).toBe("disconnected");
        expect(calls.onDisconnect.at(-1)?.[0]).toMatchObject({reason: "server", message: "resolved"});
    });

    test("ending the session leaves no timer running", async () => {
        const {conversation, sockets} = await connected({idGenerator: ids("c-1")});
        void conversation.sendUserMessage("Salom").catch(() => undefined);
        sockets.socket.serverSends({type: "message_error", client_message_id: "c-1", retryable: true, code: "unavailable"});
        await conversation.endSession();
        expect(vi.getTimerCount()).toBe(0);
    });
});
