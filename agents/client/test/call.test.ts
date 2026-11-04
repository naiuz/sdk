import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {Conversation, MicrophoneError} from "../src/index";
import {decodeAgentAudio} from "../src/frames";
import {FakeAudio, micSample} from "./fake-audio";
import {agentFrame, callMetadata, connected, fakeSockets, recorder} from "./fake-socket";
import type {FakeSocket} from "./fake-socket";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

/** Lets the microphone's start settle, so the socket opens. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** A call past its handshake, at the clock's current time. */
async function call(output: "pcm_16000" | "pcm_24000" = "pcm_24000") {
    const sockets = fakeSockets();
    const audio = new FakeAudio();
    const {calls, callbacks} = recorder();
    const started = Conversation.startSession({token: "session-token", WebSocket: sockets.factory, textOnly: false, audio, ...callbacks});
    await settle();
    sockets.socket.open();
    sockets.socket.serverSends(callMetadata(output));
    const conversation = await started;
    return {conversation, audio, sockets, socket: sockets.socket, calls};
}

/** A reply's audio as the server sends it: 20 ms frames. */
function speak(socket: FakeSocket, eventId: number, ms: number): void {
    for (let sent = 0; sent < ms; sent += 20) socket.serverSendsBinary(agentFrame(eventId, 20));
}

function reports(socket: FakeSocket): unknown[] {
    return socket.sentJson().filter((frame) => (frame as {type: string}).type === "playback");
}

function played(eventId: number, ms: number): object {
    return {type: "playback", event_id: eventId, played_ms: ms};
}

function samples(frame: Uint8Array | undefined): number[] {
    if (frame === undefined) throw new Error("no such frame");
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    return Array.from({length: (frame.byteLength - 5) / 2}, (_, i) => view.getInt16(5 + i * 2, true));
}

describe("starting a call", () => {
    test("a call asks for the microphone, then for itself with text_only false and 24 kHz output", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const started = Conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false, audio});
        expect(audio.calls).toEqual([{call: "startCapture"}]);
        expect(sockets.opened).toBe(0);
        await settle();
        expect(sockets.opened).toBe(1);
        expect(sockets.socket.binaryType).toBe("arraybuffer");
        sockets.socket.open();
        expect(sockets.socket.sentJson()).toEqual([
            {type: "conversation_initiation_client_data", text_only: false, audio: {input: "pcm_16000", output: "pcm_24000"}},
        ]);
        // Audio goes out only once the server has taken the call.
        await vi.advanceTimersByTimeAsync(100);
        expect(sockets.socket.binary).toEqual([]);
        sockets.socket.serverSends(callMetadata());
        await started;
        expect(audio.calls.at(-1)).toEqual({call: "startPlayback", rate: 24_000});

        const other = fakeSockets();
        void Conversation.startSession({token: "tok", WebSocket: other.factory, textOnly: false, output: "pcm_16000", audio: new FakeAudio()});
        await settle();
        other.socket.open();
        expect(other.socket.sentJson()).toMatchObject([{audio: {input: "pcm_16000", output: "pcm_16000"}}]);
    });

    test("a refused microphone fails the call before any socket opens", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const refusal = new DOMException("Permission denied", "NotAllowedError");
        audio.refuse(refusal);
        const {calls, callbacks} = recorder();
        const started = Conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false, audio, ...callbacks});
        await expect(started).rejects.toBeInstanceOf(MicrophoneError);
        await expect(started).rejects.toMatchObject({name: "MicrophoneError", cause: refusal});
        expect(sockets.opened).toBe(0);
        expect(audio.calls).toEqual([{call: "startCapture"}, {call: "close"}]);
        expect(calls.onStatusChange.map(([change]) => change.status)).toEqual(["connecting", "disconnected"]);
    });

    test("audio that fails to start for another reason rejects with its own error, not a microphone one", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        // As when a Content Security Policy blocks the worklet's blob: URL.
        const blocked = new DOMException("The worklet module couldn't load", "AbortError");
        audio.refuse(blocked);
        const started = Conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false, audio});
        await expect(started).rejects.toBe(blocked);
        expect(sockets.opened).toBe(0);
        expect(audio.calls.at(-1)).toEqual({call: "close"});
    });

    test("outside a browser, a call without audio fails, naming the option", async () => {
        const sockets = fakeSockets();
        await expect(Conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false})).rejects.toThrow(/audio/);
        expect(sockets.opened).toBe(0);
    });

    test("a call refused before its metadata rejects with the code and closes the audio", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const started = Conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false, audio});
        await settle();
        sockets.socket.open();
        sockets.socket.serverCloses(4009, "voice_limit");
        await expect(started).rejects.toMatchObject({code: 4009, reason: "voice_limit"});
        expect(audio.calls).toEqual([{call: "startCapture"}, {call: "close"}]);
    });

    test("a text session never touches the audio", async () => {
        const audio = new FakeAudio();
        const {socket, conversation} = await connected({audio});
        expect(socket.sentJson()).toEqual([{type: "conversation_initiation_client_data", text_only: true}]);
        conversation.setMicMuted(true);
        conversation.setVolume({volume: 0.5});
        expect(conversation.getInputVolume()).toBe(0);
        expect(conversation.getOutputVolume()).toBe(0);
        expect(audio.calls).toEqual([]);
    });
});

describe("the microphone", () => {
    test("microphone frames go out numbered from 0", async () => {
        const {socket} = await call();
        await vi.advanceTimersByTimeAsync(60);
        expect(socket.binary.map((frame) => [frame[0], frame.byteLength])).toEqual([[1, 645], [1, 645], [1, 645]]);
        expect(socket.sequences()).toEqual([0, 1, 2]);
        // Little-endian: each sample's low byte first.
        const first = micSample(1);
        expect(Array.from(socket.binary[0]?.subarray(5, 9) ?? [])).toEqual([first & 0xff, first >> 8, first & 0xff, first >> 8]);
        expect(samples(socket.binary[2])).toEqual(new Array<number>(320).fill(micSample(3)));
    });

    test("after a stall, frames that would pile up are dropped and still numbered", async () => {
        const {socket} = await call();
        socket.bufferedAmount = 40_000;
        await vi.advanceTimersByTimeAsync(40);
        expect(socket.binary).toEqual([]);
        socket.bufferedAmount = 0;
        await vi.advanceTimersByTimeAsync(20);
        expect(socket.sequences()).toEqual([2]);
    });

    test("muting sends silence, and the volume reaches the output", async () => {
        const {socket, audio, conversation} = await call();
        await vi.advanceTimersByTimeAsync(20);
        conversation.setMicMuted(true);
        await vi.advanceTimersByTimeAsync(20);
        expect(audio.calls).toContainEqual({call: "setMuted", muted: true});
        // The call's time runs on while muted: the frames still go out, silent.
        expect(socket.sequences()).toEqual([0, 1]);
        expect(samples(socket.binary[0])).toEqual(new Array<number>(320).fill(micSample(1)));
        expect(samples(socket.binary[1])).toEqual(new Array<number>(320).fill(0));
        expect(conversation.getInputVolume()).toBe(0);
        conversation.setMicMuted(false);
        expect(conversation.getInputVolume()).toBe(0.5);

        conversation.setVolume({volume: 0.4});
        conversation.setVolume({volume: 3});
        expect(audio.calls.filter((c) => c.call === "setVolume")).toEqual([{call: "setVolume", volume: 0.4}, {call: "setVolume", volume: 1}]);
        expect(conversation.getOutputVolume()).toBe(0);
        speak(socket, 1, 200);
        expect(conversation.getOutputVolume()).toBe(0.25);
    });
});

describe("the agent's audio", () => {
    test("agent audio plays at the metadata's rate, reply by reply", async () => {
        const {socket, audio} = await call("pcm_16000");
        socket.serverSendsBinary(agentFrame(1, 20, 16_000));
        socket.serverSendsBinary(agentFrame(2, 20, 16_000));
        // Frames that aren't agent audio are dropped.
        socket.serverSendsBinary(new Uint8Array([0x01, 0, 0, 0, 3, 0, 0]));
        socket.serverSendsBinary(new Uint8Array([0x02, 0, 0, 0, 3]));
        socket.serverSendsBinary(new Uint8Array([0x02, 0, 0, 0, 3, 1, 0, 2]));
        expect(audio.calls.filter((c) => c.call === "startPlayback" || c.call === "enqueue")).toEqual([
            {call: "startPlayback", rate: 16_000},
            {call: "enqueue", eventId: 1, samples: 320},
            {call: "enqueue", eventId: 2, samples: 320},
        ]);
    });

    test("an agent frame's PCM is read little-endian", () => {
        const frame = new Uint8Array([0x02, 0, 0, 1, 2, 0x01, 0x00, 0xfe, 0xff]);
        expect(decodeAgentAudio(frame.buffer)).toEqual({eventId: 258, pcm: new Int16Array([1, -2])});
    });

    test("playback is reported every 250 ms while a reply plays, at a pause and at its end", async () => {
        const {socket, audio} = await call();
        await vi.advanceTimersByTimeAsync(500);
        expect(reports(socket)).toEqual([]);
        // Two replies back to back, from 500 ms: 300 ms, then 260 ms.
        speak(socket, 1, 300);
        speak(socket, 2, 260);
        await vi.advanceTimersByTimeAsync(1000);
        expect(reports(socket)).toEqual([played(1, 250), played(1, 300), played(2, 200), played(2, 260)]);
        // From 1.5 s, a reply paused 600 ms in: nothing more while it's paused.
        speak(socket, 3, 1000);
        await vi.advanceTimersByTimeAsync(600);
        socket.serverSends({type: "audio_pause", event_id: 3});
        expect(audio.calls.at(-1)).toEqual({call: "pause"});
        await vi.advanceTimersByTimeAsync(1000);
        expect(reports(socket).slice(4)).toEqual([played(3, 250), played(3, 500), played(3, 600)]);
    });

    test("audio_resume resumes, and an interruption reports where the reply stopped, then drops it", async () => {
        const {socket, audio} = await call();
        speak(socket, 4, 2000);
        await vi.advanceTimersByTimeAsync(300);
        socket.serverSends({type: "audio_pause", event_id: 4});
        await vi.advanceTimersByTimeAsync(400);
        socket.serverSends({type: "audio_resume", event_id: 4});
        expect(audio.calls.at(-1)).toEqual({call: "resume"});
        await vi.advanceTimersByTimeAsync(100);
        socket.serverSends({type: "audio_pause", event_id: 4});
        socket.serverSends({type: "interruption", event_id: 4});
        expect(audio.calls.slice(-2)).toEqual([{call: "pause"}, {call: "drop"}]);
        expect(reports(socket)).toEqual([played(4, 250), played(4, 300), played(4, 350), played(4, 400), played(4, 400)]);
        // Audio the interrupted reply still had on its way isn't played; the next reply's is.
        const before = audio.calls.length;
        speak(socket, 4, 40);
        speak(socket, 5, 20);
        expect(audio.calls.slice(before)).toEqual([{call: "enqueue", eventId: 5, samples: 480}]);
    });

    test("a reply whose audio runs out early reports there, and again at its true end", async () => {
        const {socket} = await call();
        // 100 ms, then a stall, then 100 ms more of the same reply from 200 ms.
        speak(socket, 1, 100);
        await vi.advanceTimersByTimeAsync(200);
        speak(socket, 1, 100);
        await vi.advanceTimersByTimeAsync(300);
        expect(reports(socket)).toEqual([played(1, 100), played(1, 150), played(1, 200)]);
    });
});

describe("the call's events", () => {
    test("agent_state drives onModeChange, and a transcript reaches onMessage as spoken", async () => {
        const {socket, calls} = await call();
        for (const state of ["speaking", "listening", "listening", "thinking"]) socket.serverSends({type: "agent_state", state});
        expect(calls.onModeChange.map(([change]) => change.mode)).toEqual(["speaking", "listening", "thinking"]);
        socket.serverSends({type: "user_transcript", text: "Yetkazib berish qancha turadi?", language: "uz", occurred_at: "2026-10-30T09:15:03.905Z"});
        expect(calls.onMessage).toEqual([[{
            source: "user", message: "Yetkazib berish qancha turadi?", spoken: true, language: "uz", occurredAt: "2026-10-30T09:15:03.905Z",
        }]]);
        // An app tells what was said from what was typed by spoken alone.
        const [message] = calls.onMessage[0] ?? [];
        expect(message?.source === "user" && message.spoken ? message.language : null).toBe("uz");
    });

    test("a call that reconnects drops what played, numbers from 0 and asks for the call again", async () => {
        const {socket, sockets, audio} = await call();
        await vi.advanceTimersByTimeAsync(60);
        speak(socket, 1, 400);
        socket.serverCloses(4012, "draining");
        expect(audio.calls.at(-1)).toEqual({call: "drop"});
        await vi.advanceTimersByTimeAsync(300);
        expect(sockets.opened).toBe(2);
        expect(socket.binary).toHaveLength(3);
        const next = sockets.socket;
        expect(next.url).toContain("token=resume-1");
        next.open();
        expect(next.sentJson()).toEqual([
            {type: "conversation_initiation_client_data", text_only: false, audio: {input: "pcm_16000", output: "pcm_24000"}},
        ]);
        await vi.advanceTimersByTimeAsync(40);
        expect(next.binary).toEqual([]);
        next.serverSends(callMetadata("pcm_24000", "resume-2"));
        await vi.advanceTimersByTimeAsync(40);
        expect(next.sequences()).toEqual([0, 1]);
        expect(audio.calls.filter((c) => c.call === "startCapture" || c.call === "startPlayback")).toEqual([
            {call: "startCapture"}, {call: "startPlayback", rate: 24_000}, {call: "startPlayback", rate: 24_000},
        ]);
    });

    test("hanging up releases the microphone and the agent at once, before the socket has closed", async () => {
        const {conversation, socket, audio, calls} = await call();
        speak(socket, 1, 400);
        // A lost network can hold the close up for long.
        socket.holdClose = true;
        await conversation.endSession();
        expect(audio.calls.slice(-2)).toEqual([{call: "drop"}, {call: "close"}]);
        expect(conversation.status).toBe("disconnected");
        expect(conversation.getInputVolume()).toBe(0);
        expect(calls.onDisconnect).toEqual([[{reason: "user", code: 1000}]]);
        socket.completeClose();
        expect(calls.onDisconnect).toHaveLength(1);
    });

    test("ending the session closes the audio, and a server close closes it too", async () => {
        const ended = await call();
        await ended.conversation.endSession();
        expect(ended.audio.calls.slice(-2)).toEqual([{call: "drop"}, {call: "close"}]);
        expect(ended.conversation.getInputVolume()).toBe(0);
        await vi.advanceTimersByTimeAsync(100);
        expect(ended.socket.binary).toEqual([]);

        const taken = await call();
        taken.socket.serverCloses(4008, "taken_over");
        expect(taken.audio.calls.slice(-2)).toEqual([{call: "drop"}, {call: "close"}]);
        expect(taken.calls.onDisconnect).toEqual([[{reason: "server", code: 4008, message: "taken_over"}]]);

        const timedOut = await call();
        timedOut.socket.serverCloses(1000, "max_duration");
        timedOut.audio.finishDraining?.();
        await settle();
        expect(timedOut.audio.calls.at(-1)).toEqual({call: "close"});
        expect(timedOut.calls.onDisconnect).toEqual([[{reason: "server", code: 1000, message: "max_duration"}]]);
    });
});

describe("what the metadata says goes under the agent", () => {
    const ENVIRONMENT = {ambience_url: "/api/v1/realtime/ambience/cafe.mp3", volume: 0.4, phone_filter: true};

    async function callWith(serverUrl: string | undefined): Promise<FakeAudio> {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const started = Conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false, output: "pcm_24000", audio, serverUrl});
        await settle();
        sockets.socket.open();
        sockets.socket.serverSends({...callMetadata("pcm_24000"), audio: {input: "pcm_16000", output: "pcm_24000", environment: ENVIRONMENT}});
        await started;
        return audio;
    }

    test("it's played from the socket's own server", async () => {
        const audio = await callWith("wss://calls.example/api/v1/realtime");

        expect(audio.calls).toContainEqual({
            call: "setEnvironment",
            ambienceUrl: "https://calls.example/api/v1/realtime/ambience/cafe.mp3",
            volume: 0.4,
            phoneFilter: true,
        });
    });

    test("over plain http for a plain socket", async () => {
        const audio = await callWith("ws://localhost:8090/api/v1/realtime");

        expect(audio.calls).toContainEqual(expect.objectContaining({ambienceUrl: "http://localhost:8090/api/v1/realtime/ambience/cafe.mp3"}));
    });

    test("from NeuronAI when the page names no server", async () => {
        const audio = await callWith(undefined);

        expect(audio.calls).toContainEqual(expect.objectContaining({ambienceUrl: "https://my.neuronai.uz/api/v1/realtime/ambience/cafe.mp3"}));
    });

    test("a server that says nothing about it plays the agent alone", async () => {
        const {audio} = await call();

        expect(audio.calls.some((made) => made.call === "setEnvironment")).toBe(false);
    });
});

describe("how a call ends", () => {
    test("a close from the server lets the goodbye play out, then releases the audio", async () => {
        const {audio, socket} = await call();
        speak(socket, 7, 200);

        socket.serverCloses(1000, "ended");
        await settle();

        expect(audio.calls.some((made) => made.call === "drop")).toBe(false);
        expect(audio.calls).toContainEqual({call: "drain", limitMs: 2_000});
        expect(audio.calls.some((made) => made.call === "close")).toBe(false);

        audio.finishDraining?.();
        await settle();
        expect(audio.calls.at(-1)).toEqual({call: "close"});
    });

    test("an app that ends the call has silence at once", async () => {
        const {audio, conversation, socket} = await call();
        speak(socket, 7, 200);

        await conversation.endSession();
        await settle();

        expect(audio.calls.some((made) => made.call === "drop")).toBe(true);
        expect(audio.calls.some((made) => made.call === "drain")).toBe(false);
        expect(audio.calls.at(-1)).toEqual({call: "close"});
    });

    test("an error drops what was playing and doesn't wait", async () => {
        const {audio, socket} = await call();
        speak(socket, 7, 200);

        socket.serverCloses(4003, "not_allowed");
        await settle();

        expect(audio.calls.some((made) => made.call === "drop")).toBe(true);
        expect(audio.calls.some((made) => made.call === "drain")).toBe(false);
    });
});

