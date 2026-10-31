import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {connected, CONVERSATION, ids, metadata} from "./fake-socket";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("the conversation's status", () => {
    test("reports the conversation's status from each metadata", async () => {
        const {calls, sockets} = await connected();
        expect(calls.onConnect).toEqual([[{conversationId: CONVERSATION, status: "ai_handling"}]]);
        expect(calls.onConversationStatus).toEqual([[{status: "ai_handling"}]]);

        // The connection drops, and the reconnect finds an operator handling the conversation.
        sockets.socket.serverCloses(1001, "ping_timeout");
        await vi.advanceTimersByTimeAsync(1000);
        sockets.socket.open();
        sockets.socket.serverSends({...metadata("resume-2"), status: "human_handling"});
        expect(calls.onConversationStatus).toEqual([[{status: "ai_handling"}], [{status: "human_handling"}]]);

        // Another reconnect with the same status says nothing new.
        sockets.socket.serverCloses(1001, "ping_timeout");
        await vi.advanceTimersByTimeAsync(1000);
        sockets.socket.open();
        sockets.socket.serverSends({...metadata("resume-3"), status: "human_handling"});
        expect(calls.onConversationStatus).toHaveLength(2);
        expect(calls.onConnect).toHaveLength(1);
    });
});

describe("the app's callbacks", () => {
    test("keeps going when an app callback throws", async () => {
        const reported: unknown[] = [];
        vi.stubGlobal("reportError", (error: unknown) => reported.push(error));
        const failure = new Error("the app broke");
        const seen: string[] = [];
        const {conversation, socket} = await connected({
            idGenerator: ids("c-1"),
            onMessage: (message) => {
                seen.push(message.message);
                if (seen.length === 1) throw failure;
            },
        });

        socket.serverSends({type: "agent_response", event_id: 1, text: "Birinchi"});
        socket.serverSends({type: "agent_response", event_id: 2, text: "Ikkinchi"});
        const sent = conversation.sendUserMessage("Salom");
        socket.serverSends({type: "message_ack", client_message_id: "c-1", message_id: 7, occurred_at: "2026-10-31T10:00:00Z"});

        await expect(sent).resolves.toMatchObject({clientMessageId: "c-1", messageId: 7});
        expect(seen).toEqual(["Birinchi", "Ikkinchi"]);
        expect(reported).toEqual([failure]);
    });
});
