import {afterEach, beforeEach, expect, test, vi} from "vitest";
import {Conversation} from "../src/index";
import {FakeAudio} from "./fake-audio";
import {agentFrame, fakeSockets, recorder} from "./fake-socket";
import {clientFrames, loadFixture} from "./replay";
import type {Recorded} from "./replay";

const FRAME_MS = 20;
const RATES = {pcm_16000: 16_000, pcm_24000: 24_000} as const;

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

/**
 * Plays a recorded call against the client and FakeAudio. Time is the microphone's: each of its frames in the
 * recording is 20 ms, counted from the metadata, and anything that changes the audio happens on that grid. A frame
 * the client sends by itself, such as a playback report, may fall between two microphone frames, so the replay
 * gives it until the next one.
 */
async function replayCall(recorded: Recorded) {
    const init = recorded.frames[0]?.frame as {audio: {output: keyof typeof RATES}};
    const rate = RATES[init.audio.output];
    const sockets = fakeSockets();
    const audio = new FakeAudio();
    const {calls, callbacks} = recorder();
    const started = Conversation.startSession({
        token: recorded.token === "session" ? "session-token" : "resume-token-0",
        WebSocket: sockets.factory,
        textOnly: false,
        output: init.audio.output,
        audio,
        ...callbacks,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const socket = sockets.socket;
    socket.open();
    const origin = Date.now();
    let microphone = 0;
    let expected = 0;
    for (const item of recorded.frames) {
        if (item.close !== undefined) {
            socket.serverCloses(item.close.code, item.close.reason);
        } else if (item.audio?.kind === "user") {
            microphone += item.audio.count ?? 1;
            await vi.advanceTimersByTimeAsync(origin + microphone * FRAME_MS - Date.now());
            expect(socket.binary, `${recorded.description}: microphone frames`).toHaveLength(microphone);
        } else if (item.audio?.kind === "agent") {
            for (let i = 0; i < (item.audio.count ?? 1); i++) socket.serverSendsBinary(agentFrame(item.audio.event_id ?? 0, item.audio.ms, rate));
        } else if (item.from === "server") {
            socket.serverSends(item.frame ?? {});
            if (item.frame?.type === "conversation_initiation_metadata") await started;
        } else {
            expected++;
            for (let waited = 0; socket.sent.length < expected && waited < FRAME_MS - 1; waited++) await vi.advanceTimersByTimeAsync(1);
            expect(socket.sent.length, `${recorded.description}: the client never sent ${JSON.stringify(item.frame)}`).toBeGreaterThanOrEqual(expected);
        }
    }
    return {sent: socket.sentJson(), sequences: socket.sequences(), microphone, calls, audio};
}

function states(recorded: Recorded): string[] {
    return recorded.frames.filter((item) => item.frame?.type === "agent_state").map((item) => String(item.frame?.state));
}

test.each(["voice-call", "voice-interruption"])("replays %s: every frame the client sends, as recorded", async (name) => {
    const recorded = loadFixture(name);
    const {sent, sequences, microphone, calls} = await replayCall(recorded);
    expect(sent).toEqual(clientFrames(recorded));
    expect(sequences).toEqual(Array.from({length: microphone}, (_, i) => i));
    expect(calls.onModeChange.map(([change]) => change.mode)).toEqual(states(recorded));
});

test("voice-interruption: the client pauses, resumes and drops where the server says, and reports where it paused", async () => {
    const recorded = loadFixture("voice-interruption");
    const {sent, audio} = await replayCall(recorded);
    expect(audio.calls.filter((c) => ["pause", "resume", "drop"].includes(c.call)).map((c) => c.call)).toEqual(["pause", "resume", "pause", "drop"]);
    // The reports the pauses and the interruption call for, after the server's word on each.
    const answered = recorded.frames.flatMap((item, index) =>
        ["audio_pause", "interruption"].includes(String(item.frame?.type)) ? [recorded.frames[index + 1]?.frame] : []);
    expect(answered).toEqual([
        {type: "playback", event_id: 3, played_ms: 1800},
        {type: "playback", event_id: 3, played_ms: 2440},
        {type: "playback", event_id: 3, played_ms: 2440},
    ]);
    for (const report of answered) expect(sent).toContainEqual(report);
});
