import {describe, expect, test} from "vitest";
import {Conversation} from "../src/index";
import {CONVERSATION, connected, fakeSockets, metadata} from "./fake-socket";

describe("starting a session", () => {
    test("resolves with the conversation once the metadata arrives", async () => {
        const sockets = fakeSockets();
        const started = Conversation.startSession({token: "tok", WebSocket: sockets.factory, dynamicVariables: {plan: "pro"}});
        sockets.socket.open();
        expect(sockets.socket.sentJson()).toEqual([{type: "conversation_initiation_client_data", dynamic_variables: {plan: "pro"}, text_only: true}]);
        sockets.socket.serverSends(metadata());
        const conversation = await started;
        expect(conversation.getId()).toBe(CONVERSATION);
        expect(conversation.status).toBe("connected");
        expect(sockets.socket.url).toBe("wss://my.neuronai.uz/api/v1/realtime?token=tok");
    });

    test("sends the overrides and the user id it is given, under the protocol's names", () => {
        const sockets = fakeSockets();
        void Conversation.startSession({
            token: "tok", WebSocket: sockets.factory, serverUrl: "ws://localhost:8080/api/v1/realtime",
            overrides: {firstMessage: "Salom!", language: "ru"}, userId: "u-1",
        });
        sockets.socket.open();
        expect(sockets.socket.url).toBe("ws://localhost:8080/api/v1/realtime?token=tok");
        expect(sockets.socket.sentJson()).toEqual([{
            type: "conversation_initiation_client_data", overrides: {first_message: "Salom!", language: "ru"}, text_only: true, user_id: "u-1",
        }]);
    });

    test("a socket closed before the metadata rejects with its code", async () => {
        const sockets = fakeSockets();
        const started = Conversation.startSession({token: "bad", WebSocket: sockets.factory});
        sockets.socket.open();
        sockets.socket.serverCloses(4001, "invalid_token");
        await expect(started).rejects.toMatchObject({code: 4001, reason: "invalid_token"});
    });
});

describe("a session", () => {
    test("answers a ping with its event id", async () => {
        const {socket} = await connected();
        socket.serverSends({type: "ping", event_id: 7});
        expect(socket.sentJson().at(-1)).toEqual({type: "pong", event_id: 7});
    });

    test("calls onConnect, onModeChange and onStatusChange as it connects", async () => {
        const {calls} = await connected();
        expect(calls.onConnect).toEqual([[{conversationId: CONVERSATION, status: "ai_handling"}]]);
        expect(calls.onModeChange).toEqual([[{mode: "text"}]]);
        expect(calls.onStatusChange.map(([change]) => change.status)).toEqual(["connecting", "connected"]);
    });

    test("ignores a server event it doesn't know", async () => {
        const {socket, calls} = await connected();
        socket.serverSends({type: "agent_dance", event_id: 3});
        expect(calls.onError).toEqual([]);
    });

    test("ends with 1000 when asked, and says the user ended it", async () => {
        const {socket, conversation, calls} = await connected();
        await conversation.endSession();
        expect(socket.readyState).toBe(3);
        expect(conversation.status).toBe("disconnected");
        expect(calls.onDisconnect).toEqual([[{reason: "user", code: 1000}]]);
    });

    test("conversation_ended then the close says the server ended it", async () => {
        const {socket, calls} = await connected();
        socket.serverSends({type: "conversation_ended", reason: "resolved"});
        socket.serverCloses(1000, "ended");
        expect(calls.onDisconnect).toEqual([[{reason: "server", code: 1000, message: "resolved"}]]);
    });
});
