import {afterEach, describe, expect, test, vi} from "vitest";
import {Conversation, MicrophoneError} from "../src/index";
import {FakeAudio} from "./fake-audio";
import {callMetadata, connected, fakeSockets, metadata} from "./fake-socket";
import {clientFrames, loadFixture, replay} from "./replay";

afterEach(() => {
    vi.useRealTimers();
});

describe("telling the agent something", () => {
    test("a contextual update goes out under the protocol's names", async () => {
        const {conversation, socket} = await connected();
        conversation.sendContextualUpdate("On delivery.", {contextId: "page"});
        conversation.sendContextualUpdate("Logged in.");
        expect(socket.sentJson().slice(-2)).toEqual([
            {type: "contextual_update", text: "On delivery.", context_id: "page"},
            {type: "contextual_update", text: "Logged in."},
        ]);
    });

    test.each([
        ["no text", "", undefined],
        ["too much text", "x".repeat(2001), undefined],
        ["an id that isn't one", "Fine.", "not an id!"],
    ])("%s throws, rather than closing nothing and saying nothing", async (_name, text, contextId) => {
        const {conversation} = await connected();
        expect(() => {
            conversation.sendContextualUpdate(text, contextId === undefined ? {} : {contextId});
        }).toThrow(TypeError);
    });

    test("what's said while the connection is down goes out when it's back", async () => {
        vi.useFakeTimers();
        const {conversation, sockets} = await connected();
        sockets.socket.serverCloses(1006, "");
        conversation.sendContextualUpdate("On delivery.", {contextId: "page"});
        conversation.sendFeedback(2, "like");
        await vi.advanceTimersByTimeAsync(250);
        sockets.socket.open();
        expect(sockets.socket.sentJson()).toHaveLength(1);
        sockets.socket.serverSends(metadata());
        expect(sockets.socket.sentJson().slice(1)).toEqual([
            {type: "contextual_update", text: "On delivery.", context_id: "page"},
            {type: "feedback", event_id: 2, score: "like"},
        ]);
    });

    test("that the customer is typing is worth saying only now", async () => {
        vi.useFakeTimers();
        const {conversation, sockets} = await connected();
        conversation.sendUserActivity();
        expect(sockets.socket.sentJson().at(-1)).toEqual({type: "user_activity"});
        sockets.socket.serverCloses(1006, "");
        conversation.sendUserActivity();
        await vi.advanceTimersByTimeAsync(250);
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        expect(sockets.socket.sentJson().map((frame) => (frame as {type: string}).type)).not.toContain("user_activity");
    });

    test("feedback rates a reply by its event, and null takes it back", async () => {
        const {conversation, socket} = await connected();
        conversation.sendFeedback(2, "dislike");
        conversation.sendFeedback(2, null);
        expect(socket.sentJson().slice(-2)).toEqual([
            {type: "feedback", event_id: 2, score: "dislike"},
            {type: "feedback", event_id: 2, score: null},
        ]);
    });

    test.each([0, -1, 1.5, 2 ** 53, 2 ** 63])("feedback on event %d can't be sent", async (eventId) => {
        const {conversation} = await connected();
        expect(() => {
            conversation.sendFeedback(eventId, "like");
        }).toThrow(TypeError);
    });

    test("feedback says whether it went, and after the end it can't", async () => {
        vi.useFakeTimers();
        const {conversation, sockets} = await connected();
        expect(conversation.sendFeedback(2, "like")).toBe(true);
        sockets.socket.serverCloses(1006, "");
        expect(conversation.sendFeedback(3, "like")).toBe(true);
        await conversation.endSession();
        expect(conversation.sendFeedback(4, "like")).toBe(false);
    });

    test("typing is said once a second, however often the page says it", async () => {
        vi.useFakeTimers();
        const {conversation, socket} = await connected();
        const typing = () => socket.sentJson().filter((frame) => (frame as {type: string}).type === "user_activity");
        for (let key = 0; key < 60; key++) conversation.sendUserActivity();
        expect(typing()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(999);
        conversation.sendUserActivity();
        expect(typing()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        conversation.sendUserActivity();
        expect(typing()).toHaveLength(2);
    });

    test("what's held for the connection's return keeps the newest", async () => {
        vi.useFakeTimers();
        const {conversation, sockets} = await connected();
        sockets.socket.serverCloses(1006, "");
        for (let page = 1; page <= 40; page++) conversation.sendContextualUpdate(`On page ${String(page)}.`);
        await vi.advanceTimersByTimeAsync(250);
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        const sent = sockets.socket.sentJson().slice(1) as {text: string}[];
        expect(sent).toHaveLength(32);
        expect(sent.at(-1)?.text).toBe("On page 40.");
    });

    test("nothing goes out once the session is over", async () => {
        const {conversation, socket} = await connected();
        await conversation.endSession();
        const sent = socket.sentJson().length;
        conversation.sendContextualUpdate("Too late.");
        conversation.sendUserActivity();
        conversation.sendFeedback(2, "like");
        expect(socket.sentJson()).toHaveLength(sent);
    });
});

describe("what the agent tells the page", () => {
    test("which tool it's using, and how that's going", async () => {
        const {socket, calls} = await connected();
        socket.serverSends({type: "agent_tool_response", tool_name: "check_delivery", tool_type: "webhook", status: "running"});
        expect(calls.onAgentToolResponse).toEqual([[{toolName: "check_delivery", toolType: "webhook", status: "running"}]]);
    });

    test("that it moved to another language", async () => {
        const {socket, calls} = await connected();
        socket.serverSends({type: "language_changed", language: "ru"});
        expect(calls.onLanguageChange).toEqual([[{language: "ru"}]]);
    });

    test("that a check stopped a reply, by its name and what happens next", async () => {
        const {socket, calls} = await connected();
        socket.serverSends({type: "guardrail_triggered", name: "Chegirmalar", action: "retry"});
        expect(calls.onGuardrailTriggered).toEqual([[{name: "Chegirmalar", action: "retry"}]]);
    });

    test("that the customer spoke over a reply", async () => {
        const audio = new FakeAudio();
        const sockets = fakeSockets();
        const onInterruption = vi.fn();
        const started = Conversation.startSession({token: "tok", textOnly: false, audio, WebSocket: sockets.factory, onInterruption});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        sockets.socket.open();
        sockets.socket.serverSends(callMetadata());
        await started;
        sockets.socket.serverSends({type: "interruption", event_id: 7});
        expect(onInterruption).toHaveBeenCalledWith({eventId: 7});
    });
});

test("a recorded session with all of it replays", async () => {
    const recorded = loadFixture("page-context");
    const {sent, calls} = await replay(recorded, {idGenerator: () => "c-1"});
    expect(sent).toEqual(clientFrames(recorded));
    expect(calls.onAgentToolResponse.map(([tool]) => tool.status)).toEqual(["running", "done"]);
    expect(calls.onLanguageChange).toEqual([[{language: "ru"}]]);
});

test("a reply a check stopped replays, withdrawn before the one that follows it", async () => {
    const recorded = loadFixture("guardrail");
    const {sent, calls} = await replay(recorded, {idGenerator: () => "c-1"});
    expect(sent).toEqual(clientFrames(recorded));
    expect(calls.onAgentResponseCorrection).toHaveLength(1);
    expect(calls.onGuardrailTriggered).toEqual([[{name: "Chegirmalar", action: "retry"}]]);
});

describe("changing devices in a call", () => {
    async function call() {
        const audio = new FakeAudio();
        const sockets = fakeSockets();
        const onError = vi.fn();
        const started = Conversation.startSession({token: "tok", textOnly: false, audio, WebSocket: sockets.factory, onError});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        sockets.socket.open();
        sockets.socket.serverSends(callMetadata());
        return {conversation: await started, audio, onError};
    }

    test("hands the audio the microphone and the speaker", async () => {
        const {conversation, audio} = await call();
        await conversation.changeInputDevice({deviceId: "mic-2"});
        await conversation.changeOutputDevice({deviceId: "speaker-2"});
        expect(audio.inputDevice).toBe("mic-2");
        expect(audio.outputDevice).toBe("speaker-2");
    });

    test("a device that's gone rejects, and the call stays on what it has", async () => {
        const {conversation, audio} = await call();
        const gone = new MicrophoneError(new Error("gone"));
        audio.inputDeviceError = gone;
        await expect(conversation.changeInputDevice({deviceId: "mic-2"})).rejects.toBe(gone);
        expect(conversation.status).toBe("connected");
    });

    test("an audio that can't change devices says so", async () => {
        const {conversation, audio} = await call();
        audio.changeInputDevice = undefined;
        await expect(conversation.changeInputDevice({deviceId: "mic-2"})).rejects.toThrow(/can't change/);
    });

    test("does nothing outside a call", async () => {
        const {conversation} = await connected();
        await expect(conversation.changeInputDevice({deviceId: "mic-2"})).resolves.toBeUndefined();
        await expect(conversation.changeOutputDevice({deviceId: "speaker-2"})).resolves.toBeUndefined();
    });

    test("a microphone that stops mid-call says so, and the call goes on", async () => {
        const {conversation, audio, onError} = await call();
        audio.onInputLost?.();
        expect(onError).toHaveBeenCalledWith(expect.any(String), {code: "microphone_lost"});
        expect(conversation.status).toBe("connected");
    });
});
