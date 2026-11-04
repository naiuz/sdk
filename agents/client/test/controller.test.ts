import {describe, expect, test, vi} from "vitest";
import {ConversationController} from "../src/index";
import type {ConversationState} from "../src/index";
import {FakeAudio} from "./fake-audio";
import {callMetadata, CONVERSATION, fakeSockets, metadata} from "./fake-socket";
import type {FakeSockets} from "./fake-socket";

async function opened(sockets: FakeSockets, count: number): Promise<void> {
    await vi.waitFor(() => {
        expect(sockets.opened).toBe(count);
    });
}

function answer(sockets: FakeSockets, event: object = metadata()): void {
    sockets.socket.open();
    sockets.socket.serverSends(event);
}

describe("a controller's state", () => {
    test("starts disconnected, with nothing known", () => {
        expect(new ConversationController().getSnapshot()).toEqual({status: "disconnected", mode: null, conversationStatus: null, micMuted: false});
    });

    test("follows the session, and each change is a new object for React to compare", async () => {
        const sockets = fakeSockets();
        const controller = new ConversationController();
        const seen: ConversationState[] = [];
        controller.subscribe(() => seen.push(controller.getSnapshot()));
        const before = controller.getSnapshot();
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        answer(sockets);
        await expect(starting).resolves.toBe(CONVERSATION);
        expect(controller.getSnapshot()).toMatchObject({status: "connected", mode: "text", conversationStatus: "ai_handling"});
        expect(controller.getSnapshot()).not.toBe(before);
        expect(seen.map((state) => state.status)).toContain("connecting");
    });

    test("is changed before the app's callback hears", async () => {
        const sockets = fakeSockets();
        const heard: string[] = [];
        const controller: ConversationController = new ConversationController({
            onStatusChange: ({status}) => {
                heard.push(`${status}/${controller.getSnapshot().status}`);
            },
        });
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        answer(sockets);
        await starting;
        expect(heard).toEqual(["connecting/connecting", "connected/connected"]);
    });

    test("calls the callbacks of the moment, so a re-render's aren't stale", async () => {
        const sockets = fakeSockets();
        const first = vi.fn();
        const second = vi.fn();
        let current = first;
        const controller = new ConversationController(() => ({onMessage: current}));
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        answer(sockets);
        await starting;
        current = second;
        sockets.socket.serverSends({type: "agent_response", event_id: 2, text: "Salom"});
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });

    test("stops listening when asked", () => {
        const controller = new ConversationController();
        const listener = vi.fn();
        const stop = controller.subscribe(listener);
        stop();
        controller.setMicMuted(true);
        expect(listener).not.toHaveBeenCalled();
        expect(controller.getSnapshot().micMuted).toBe(true);
    });
});

describe("starting and ending", () => {
    test("the newest start wins, and the one it replaced ends itself", async () => {
        const sockets = fakeSockets();
        const controller = new ConversationController();
        const first = controller.startSession({token: "one", WebSocket: sockets.factory});
        await opened(sockets, 1);
        const firstSocket = sockets.socket;
        const second = controller.startSession({token: "two", WebSocket: sockets.factory});
        await opened(sockets, 2);
        firstSocket.open();
        firstSocket.serverSends(metadata());
        await expect(first).rejects.toThrow(/newer session/);
        answer(sockets);
        await expect(second).resolves.toBe(CONVERSATION);
        expect(controller.getSnapshot().status).toBe("connected");
    });

    test("ending during a start shows disconnected at once, and the start closes when it arrives", async () => {
        const sockets = fakeSockets();
        const onDisconnect = vi.fn();
        const controller = new ConversationController({onDisconnect});
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        await controller.endSession();
        expect(controller.getSnapshot().status).toBe("disconnected");
        expect(onDisconnect).toHaveBeenCalledWith({reason: "user"});
        const socket = sockets.socket;
        answer(sockets);
        await expect(starting).rejects.toThrow();
        expect(socket.readyState).toBe(3);
    });

    test("can be disposed and used again, as React's StrictMode does on every mount", async () => {
        const sockets = fakeSockets();
        const controller = new ConversationController();
        const first = controller.startSession({token: "one", WebSocket: sockets.factory});
        await opened(sockets, 1);
        const firstSocket = sockets.socket;
        controller.dispose();
        const second = controller.startSession({token: "two", WebSocket: sockets.factory});
        await opened(sockets, 2);
        firstSocket.open();
        firstSocket.serverSends(metadata());
        await expect(first).rejects.toThrow();
        expect(firstSocket.readyState).toBe(3);
        answer(sockets);
        await expect(second).resolves.toBe(CONVERSATION);
        expect(controller.getSnapshot().status).toBe("connected");
    });

    test("disposing ends a session that's going", async () => {
        const sockets = fakeSockets();
        const controller = new ConversationController();
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        answer(sockets);
        await starting;
        controller.dispose();
        expect(sockets.socket.readyState).toBe(3);
        expect(controller.getSnapshot()).toMatchObject({status: "disconnected", mode: null, conversationStatus: null});
    });
});

describe("what's said while a session starts", () => {
    test("goes out once it has: onConnect is the moment a page tells it where the customer is", async () => {
        const sockets = fakeSockets();
        const controller: ConversationController = new ConversationController({
            onConnect: () => {
                controller.sendContextualUpdate("On checkout.", {contextId: "page"});
            },
        });
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        controller.sendContextualUpdate("Logged in.", {contextId: "login"});
        expect(controller.sendFeedback(2, "like")).toBe(true);
        await opened(sockets, 1);
        answer(sockets);
        await starting;
        expect(sockets.socket.sentJson().slice(1)).toEqual([
            {type: "contextual_update", text: "Logged in.", context_id: "login"},
            {type: "feedback", event_id: 2, score: "like"},
            {type: "contextual_update", text: "On checkout.", context_id: "page"},
        ]);
    });

    test("goes nowhere when the start fails, or to the next session", async () => {
        const sockets = fakeSockets();
        const controller = new ConversationController();
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        controller.sendContextualUpdate("Logged in.");
        await opened(sockets, 1);
        sockets.socket.open();
        sockets.socket.serverCloses(4001, "invalid_token");
        await expect(starting).rejects.toThrow();
        const again = controller.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 2);
        answer(sockets);
        await again;
        expect(sockets.socket.sentJson()).toHaveLength(1);
    });

    test("with nothing starting, says it went nowhere", () => {
        expect(new ConversationController().sendFeedback(2, "like")).toBe(false);
    });
});

describe("what it does with a session", () => {
    async function going() {
        const sockets = fakeSockets();
        const controller = new ConversationController();
        const starting = controller.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        answer(sockets);
        await starting;
        return {controller, socket: sockets.socket};
    }

    test("sends what the session sends", async () => {
        const {controller, socket} = await going();
        controller.sendContextualUpdate("On delivery.", {contextId: "page"});
        controller.sendUserActivity();
        controller.sendFeedback(2, "like");
        expect(socket.sentJson().slice(-3)).toEqual([
            {type: "contextual_update", text: "On delivery.", context_id: "page"},
            {type: "user_activity"},
            {type: "feedback", event_id: 2, score: "like"},
        ]);
        expect(controller.getId()).toBe(CONVERSATION);
        expect(controller.getResumeToken()).toBe("resume-1");
    });

    test("with no session, a message is refused and the rest do nothing", async () => {
        const controller = new ConversationController();
        await expect(controller.sendUserMessage("Salom")).rejects.toThrow(/Start a session/);
        controller.sendContextualUpdate("On delivery.");
        controller.sendUserActivity();
        controller.sendFeedback(2, "like");
        await expect(controller.changeInputDevice({deviceId: "mic"})).resolves.toBeUndefined();
        expect(controller.getInputVolume()).toBe(0);
        expect(controller.getId()).toBe("");
        expect(controller.getResumeToken()).toBeNull();
    });

    test("a mute set before a call holds when it starts", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const controller = new ConversationController();
        controller.setMicMuted(true);
        const starting = controller.startSession({token: "tok", textOnly: false, audio, WebSocket: sockets.factory});
        await opened(sockets, 1);
        answer(sockets, callMetadata());
        await starting;
        expect(audio.calls).toContainEqual({call: "setMuted", muted: true});
    });
});
