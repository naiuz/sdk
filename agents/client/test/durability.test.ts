import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {connected, ids} from "./fake-socket";
import {loadFixture, replay, resumeTokenOf} from "./replay";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("sending", () => {
    test("a retryable error sends the same message again, and its ack resolves the send once", async () => {
        const {sent, acks} = await replay(loadFixture("retried-message"), {idGenerator: ids("c-1")});
        expect(sent.filter((frame) => (frame as {type: string}).type === "user_message").map((frame) => (frame as {client_message_id: string}).client_message_id)).toEqual(["c-1", "c-1"]);
        expect(acks).toEqual([{clientMessageId: "c-1", messageId: 981, occurredAt: "2026-10-30T09:15:02.120Z"}]);
    });

    test("a rate-limited message is sent again with its id, and saved", async () => {
        const {sent, acks} = await replay(loadFixture("rate-limited-message"), {idGenerator: ids("c-1")});
        expect(sent.filter((frame) => (frame as {type: string}).type === "user_message")).toHaveLength(2);
        expect(acks.map((ack) => ack.messageId)).toEqual([981]);
    });

    test("a refused message rejects at once, without a retry", async () => {
        const {errors, sent} = await replay(loadFixture("refused-message"), {idGenerator: ids("c-1")});
        expect(errors).toEqual([expect.objectContaining({clientMessageId: "c-1", retryable: false, code: "refused"})]);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(sent.filter((frame) => (frame as {type: string}).type === "user_message")).toHaveLength(1);
    });

    test("three retryable errors in a row reject the send", async () => {
        const {socket, conversation} = await connected({idGenerator: ids("c-1")});
        const sending = conversation.sendUserMessage("Salom");
        sending.catch(() => undefined);
        for (let retry = 0; retry < 4; retry++) {
            socket.serverSends({type: "message_error", client_message_id: "c-1", retryable: true, code: "unavailable"});
            await vi.advanceTimersByTimeAsync(500 * 2 ** retry);
        }
        await expect(sending).rejects.toMatchObject({retryable: true, code: "unavailable"});
        expect(socket.sentJson().filter((frame) => (frame as {type: string}).type === "user_message")).toHaveLength(4);
    });
});

describe("resuming", () => {
    test("a drain reconnects with the resume token, shows the history and sends the unacked message again", async () => {
        const draining = loadFixture("draining");
        const {urls, sent, calls, acks} = await replay(draining, {then: loadFixture("resumed-after-drain"), idGenerator: ids("c-1")});
        expect(urls[1]).toBe(`wss://my.neuronai.uz/api/v1/realtime?token=${resumeTokenOf(draining)}`);
        expect(calls.onStatusChange.map(([change]) => change.status)).toEqual(["connecting", "connected", "reconnecting", "connected"]);
        expect(calls.onHistory).toHaveLength(1);
        expect(sent.filter((frame) => (frame as {type: string}).type === "user_message").map((frame) => (frame as {client_message_id: string}).client_message_id)).toEqual(["c-1", "c-1"]);
        expect(acks.map((ack) => ack.messageId)).toEqual([981]);
        expect(calls.onConnect).toHaveLength(1);
    });

    test("an expired resume token ends the session", async () => {
        const {sockets, conversation, calls} = await connected();
        sockets.socket.serverCloses(4012, "draining");
        await vi.advanceTimersByTimeAsync(250);
        expect(sockets.opened).toBe(2);
        sockets.socket.serverCloses(4001, "invalid_token");
        expect(conversation.status).toBe("disconnected");
        expect(calls.onDisconnect.at(-1)?.[0]).toMatchObject({reason: "error", code: 4001});
    });

    test.each([1000, 1008, 4003, 4029])("close %i ends the session without reconnecting", async (code) => {
        const {sockets, conversation} = await connected();
        sockets.socket.serverCloses(code, "x");
        await vi.advanceTimersByTimeAsync(10_000);
        expect(sockets.opened).toBe(1);
        expect(conversation.status).toBe("disconnected");
    });

    test("ending the session while it waits to reconnect stops the reconnect", async () => {
        const {sockets, conversation, calls} = await connected();
        sockets.socket.serverCloses(4012, "draining");
        await conversation.endSession();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(sockets.opened).toBe(1);
        expect(conversation.status).toBe("disconnected");
        expect(calls.onDisconnect).toEqual([[{reason: "user"}]]);
    });

    test("ending the session while a reconnect connects closes that socket and ends once", async () => {
        const {sockets, conversation, calls} = await connected();
        sockets.socket.serverCloses(4012, "draining");
        await vi.advanceTimersByTimeAsync(250);
        await conversation.endSession();
        expect(sockets.socket.readyState).toBe(3);
        expect(calls.onDisconnect).toEqual([[{reason: "user", code: 1000}]]);
    });

    test("ten failed reconnects end the session, and an unsent message fails as retryable", async () => {
        const {sockets, conversation, calls} = await connected({idGenerator: ids("c-1")});
        sockets.socket.serverCloses(1006, "");
        const sending = conversation.sendUserMessage("Salom");
        sending.catch(() => undefined);
        for (let attempt = 0; attempt < 10; attempt++) {
            await vi.advanceTimersByTimeAsync(Math.min(250 * 2 ** attempt, 8000));
            expect(sockets.opened).toBe(attempt + 2);
            sockets.socket.serverCloses(1006, "");
        }
        expect(conversation.status).toBe("disconnected");
        expect(calls.onDisconnect.at(-1)?.[0]).toMatchObject({reason: "error", code: 1006});
        await expect(sending).rejects.toMatchObject({clientMessageId: "c-1", retryable: true});
    });
});
