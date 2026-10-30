import {effectScope} from "vue";
import {describe, expect, test, vi} from "vitest";
import type {Callbacks} from "@naiuz/agents";
import {useConversation} from "../src/index";
import {FakeAudio} from "../../client/test/fake-audio";
import {callMetadata, CONVERSATION, fakeSockets, metadata} from "../../client/test/fake-socket";
import type {FakeSockets} from "../../client/test/fake-socket";

/** The composable inside a scope, as a component's setup would have it. */
function inScope(callbacks?: Callbacks) {
    const scope = effectScope();
    const conversation = scope.run(() => useConversation(callbacks));
    if (conversation === undefined) throw new Error("the scope didn't run");
    return {conversation, scope};
}

/** Lets a start get as far as opening its socket. */
async function opened(sockets: FakeSockets, count: number): Promise<void> {
    await vi.waitFor(() => {
        expect(sockets.opened).toBe(count);
    });
}

describe("useConversation", () => {
    test("status and mode follow the session", async () => {
        const {conversation} = inScope();
        expect([conversation.status.value, conversation.mode.value]).toEqual(["disconnected", null]);
        const sockets = fakeSockets();
        const started = conversation.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        expect(conversation.status.value).toBe("connecting");
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        expect(await started).toBe(CONVERSATION);
        expect([conversation.status.value, conversation.mode.value]).toEqual(["connected", "text"]);
        expect(conversation.getId()).toBe(CONVERSATION);
        expect(conversation.getResumeToken()).toBe("resume-1");
        await conversation.endSession();
        expect([conversation.status.value, conversation.mode.value]).toEqual(["disconnected", null]);
        expect(conversation.getId()).toBe("");
    });

    test("isSpeaking holds only while the agent speaks", async () => {
        const {conversation} = inScope();
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const started = conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false, audio});
        await opened(sockets, 1);
        sockets.socket.open();
        sockets.socket.serverSends(callMetadata());
        await started;
        expect([conversation.mode.value, conversation.isSpeaking.value]).toEqual([null, false]);
        sockets.socket.serverSends({type: "agent_state", state: "speaking"});
        expect([conversation.mode.value, conversation.isSpeaking.value]).toEqual(["speaking", true]);
        sockets.socket.serverSends({type: "agent_state", state: "listening"});
        expect([conversation.mode.value, conversation.isSpeaking.value]).toEqual(["listening", false]);
        await conversation.endSession();
    });

    test("micMuted follows setMicMuted", async () => {
        const {conversation} = inScope();
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const started = conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false, audio});
        await opened(sockets, 1);
        sockets.socket.open();
        sockets.socket.serverSends(callMetadata());
        await started;
        expect(conversation.micMuted.value).toBe(false);
        conversation.setMicMuted(true);
        expect(conversation.micMuted.value).toBe(true);
        expect(audio.calls).toContainEqual({call: "setMuted", muted: true});
        expect(conversation.getInputVolume()).toBe(0);
        conversation.setVolume({volume: 0.5});
        expect(audio.calls).toContainEqual({call: "setVolume", volume: 0.5});
        await conversation.endSession();
        expect(conversation.getOutputVolume()).toBe(0);
    });

    test("a second startSession ends the first", async () => {
        const {conversation} = inScope();
        const first = fakeSockets();
        const one = conversation.startSession({token: "one", WebSocket: first.factory});
        await opened(first, 1);
        first.socket.open();
        first.socket.serverSends(metadata("resume-one"));
        await one;
        const second = fakeSockets();
        const two = conversation.startSession({token: "two", WebSocket: second.factory});
        await opened(second, 1);
        expect(first.socket.readyState).toBe(3);
        expect(conversation.status.value).toBe("connecting");
        second.socket.open();
        second.socket.serverSends(metadata("resume-two"));
        await two;
        expect([conversation.status.value, conversation.getResumeToken()]).toEqual(["connected", "resume-two"]);

        // A call that replaces a text session has no mode until the agent's first state.
        const call = fakeSockets();
        const calling = conversation.startSession({token: "call", WebSocket: call.factory, textOnly: false, audio: new FakeAudio()});
        await opened(call, 1);
        call.socket.open();
        call.socket.serverSends(callMetadata("pcm_24000", "resume-call"));
        await calling;
        expect([conversation.status.value, conversation.mode.value]).toEqual(["connected", null]);

        // A start still waiting for its metadata is ended once it arrives, and its promise says so.
        const third = fakeSockets();
        const three = conversation.startSession({token: "three", WebSocket: third.factory});
        three.catch(() => undefined);
        await opened(third, 1);
        const fourth = fakeSockets();
        const four = conversation.startSession({token: "four", WebSocket: fourth.factory});
        await opened(fourth, 1);
        third.socket.open();
        third.socket.serverSends(metadata("resume-three"));
        await expect(three).rejects.toThrow(/replaced/);
        expect(third.socket.readyState).toBe(3);
        fourth.socket.open();
        fourth.socket.serverSends(metadata("resume-four"));
        await four;
        expect([conversation.status.value, conversation.getResumeToken()]).toEqual(["connected", "resume-four"]);
        await conversation.endSession();
    });

    test("the scope's end ends the session", async () => {
        const {conversation, scope} = inScope();
        const sockets = fakeSockets();
        const started = conversation.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        await started;
        scope.stop();
        expect(sockets.socket.readyState).toBe(3);
    });

    test("the app's callbacks still run", async () => {
        const seen: string[] = [];
        const {conversation} = inScope({
            // Each sees the composable's state already updated.
            onStatusChange: ({status}) => seen.push(`status ${status} ${conversation.status.value}`),
            onModeChange: ({mode}) => seen.push(`mode ${mode} ${String(conversation.mode.value)}`),
            onMessage: ({message}) => seen.push(`message ${message}`),
            onDisconnect: ({reason}) => seen.push(`disconnect ${reason} ${String(conversation.mode.value)}`),
        });
        const sockets = fakeSockets();
        const started = conversation.startSession({token: "tok", WebSocket: sockets.factory});
        await opened(sockets, 1);
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        await started;
        sockets.socket.serverSends({type: "agent_response", event_id: 1, text: "Salom"});
        await conversation.endSession();
        expect(seen).toEqual([
            "status connecting connecting",
            "status connected connected",
            "mode text text",
            "message Salom",
            "status disconnected disconnected",
            "disconnect user null",
        ]);
    });
});
