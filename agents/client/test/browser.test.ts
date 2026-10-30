import {beforeEach, describe, expect, test, vi} from "vitest";
import type {MockInstance} from "vitest";
import {BrowserAudio, Conversation} from "../src/index";
import {callMetadata, fakeSockets} from "./fake-socket";

class FakeTrack {
    stopped = false;

    stop(): void {
        this.stopped = true;
    }
}

class FakeStream {
    readonly tracks = [new FakeTrack()];

    getTracks(): FakeTrack[] {
        return this.tracks;
    }
}

class FakeNode {
    readonly connections: unknown[] = [];
    disconnected = false;

    connect<T>(target: T): T {
        this.connections.push(target);
        return target;
    }

    disconnect(): void {
        this.disconnected = true;
    }
}

class FakeGain extends FakeNode {
    readonly gain = {value: 1};
}

class FakeStreamDestination extends FakeNode {
    readonly stream = new FakeStream();
}

class FakeSource extends FakeNode {
    constructor(readonly mediaStream: unknown) {
        super();
    }
}

class FakePort {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    readonly posted: {message: unknown; transfer: unknown}[] = [];

    postMessage(message: unknown, transfer?: unknown): void {
        this.posted.push({message, transfer});
    }
}

const contexts: FakeContext[] = [];
const workletNodes: FakeWorkletNode[] = [];

class FakeContext {
    state = "suspended";
    readonly sampleRate = 48_000;
    readonly destination = new FakeNode();
    readonly modules: string[] = [];
    readonly made: FakeNode[] = [];
    /** Makes the worklet's module fail to load, as a Content Security Policy blocking blob: does. */
    moduleError: Error | null = null;
    readonly audioWorklet = {
        addModule: (url: string) => {
            this.modules.push(url);
            return this.moduleError === null ? Promise.resolve() : Promise.reject(this.moduleError);
        },
    };
    readonly resume = vi.fn(() => {
        this.state = "running";
        return Promise.resolve();
    });
    readonly close = vi.fn(() => {
        this.state = "closed";
        return Promise.resolve();
    });

    constructor() {
        contexts.push(this);
    }

    createGain(): FakeGain {
        return this.keep(new FakeGain());
    }

    createMediaStreamDestination(): FakeStreamDestination {
        return this.keep(new FakeStreamDestination());
    }

    createMediaStreamSource(stream: unknown): FakeSource {
        return this.keep(new FakeSource(stream));
    }

    private keep<T extends FakeNode>(node: T): T {
        this.made.push(node);
        return node;
    }
}

class FakeWorkletNode extends FakeNode {
    readonly port = new FakePort();

    constructor(readonly context: FakeContext, readonly name: string, readonly options: unknown) {
        super();
        workletNodes.push(this);
    }
}

class FakeElement {
    srcObject: unknown = null;
    paused = true;
    plays = 0;

    play(): Promise<void> {
        this.plays++;
        this.paused = false;
        return Promise.resolve();
    }

    pause(): void {
        this.paused = true;
    }
}

const microphone = new FakeStream();
const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<unknown>>();
let created: MockInstance<typeof URL.createObjectURL>;
let revoked: MockInstance<typeof URL.revokeObjectURL>;

beforeEach(() => {
    contexts.length = 0;
    workletNodes.length = 0;
    microphone.tracks[0] = new FakeTrack();
    getUserMedia.mockClear();
    getUserMedia.mockImplementation(() => Promise.resolve(microphone));
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
    vi.stubGlobal("Audio", FakeElement);
    vi.stubGlobal("navigator", {mediaDevices: {getUserMedia}});
    created = vi.spyOn(URL, "createObjectURL");
    revoked = vi.spyOn(URL, "revokeObjectURL");
});

function context(): FakeContext {
    const made = contexts.at(-1);
    if (made === undefined) throw new Error("no AudioContext was made");
    return made;
}

function node(name: string): FakeWorkletNode {
    const made = workletNodes.find((worklet) => worklet.name === name);
    if (made === undefined) throw new Error(`no ${name} node was made`);
    return made;
}

function made<T extends FakeNode>(kind: new (...args: never[]) => T): T {
    const found = context().made.find((candidate): candidate is T => candidate instanceof kind);
    if (found === undefined) throw new Error(`no ${kind.name} was made`);
    return found;
}

function element(): FakeElement & HTMLAudioElement {
    return new FakeElement() as FakeElement & HTMLAudioElement;
}

describe("capture", () => {
    test("capture asks for an echo-cancelled mono microphone and resumes a suspended context", async () => {
        const audio = new BrowserAudio();
        const started = audio.startCapture();
        // Both start before the first await, inside the caller's gesture.
        expect(getUserMedia).toHaveBeenCalledWith({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1}});
        expect(context().resume).toHaveBeenCalled();
        await started;
        expect(created).toHaveBeenCalledTimes(1);
        expect(context().modules).toHaveLength(1);
        const capture = node("naiuz-capture");
        expect(made(FakeSource).mediaStream).toBe(microphone);
        expect(made(FakeSource).connections).toEqual([capture]);
        // Its output is silence, but a node nothing pulls may never run.
        expect(capture.connections).toEqual([context().destination]);

        const frames: Int16Array[] = [];
        audio.onFrame = (pcm) => frames.push(pcm);
        capture.port.onmessage?.({data: {frame: new Int16Array(320).fill(5), level: 0.3}});
        expect(frames).toEqual([new Int16Array(320).fill(5)]);
        expect(audio.inputLevel()).toBe(0.3);
        audio.setMuted(true);
        expect(capture.port.posted.at(-1)?.message).toEqual({muted: true});
        expect(audio.inputLevel()).toBe(0);
    });

    test("a refused microphone is a MicrophoneError", async () => {
        const refusal = new DOMException("Permission denied", "NotAllowedError");
        getUserMedia.mockImplementation(() => Promise.reject(refusal));
        await expect(new BrowserAudio().startCapture()).rejects.toMatchObject({name: "MicrophoneError", cause: refusal});
        // Whatever else the microphone fails with, such as a device error, is the microphone's too.
        const broken = new DOMException("Could not start audio source", "AbortError");
        getUserMedia.mockImplementation(() => Promise.reject(broken));
        await expect(new BrowserAudio().startCapture()).rejects.toMatchObject({name: "MicrophoneError", cause: broken});
        // A page that isn't secure has no microphone at all.
        vi.stubGlobal("navigator", {});
        await expect(new BrowserAudio().startCapture()).rejects.toMatchObject({name: "MicrophoneError", cause: {name: "TypeError"}});
    });

    test("a worklet that won't load rejects with its own error, not a microphone one", async () => {
        const audio = new BrowserAudio();
        const blocked = new DOMException("The user aborted a request.", "AbortError");
        context().moduleError = blocked;
        await expect(audio.startCapture()).rejects.toBe(blocked);
    });

    test("an input stream stands in for the microphone", async () => {
        const input = new FakeStream();
        const audio = new BrowserAudio({inputStream: input as unknown as MediaStream});
        await audio.startCapture();
        expect(getUserMedia).not.toHaveBeenCalled();
        expect(made(FakeSource).mediaStream).toBe(input);
        await audio.close();
        expect(input.tracks[0]?.stopped).toBe(false);
    });
});

describe("playback", () => {
    test("playback goes out through the media element", async () => {
        const output = element();
        const audio = new BrowserAudio({element: output});
        const started = audio.startCapture();
        // The element starts playing inside the caller's gesture, where browsers let it.
        expect(output.srcObject).toBe(made(FakeStreamDestination).stream);
        expect(output.plays).toBe(1);
        await started;
        audio.startPlayback(24_000);
        const playback = node("naiuz-playback");
        expect(playback.port.posted[0]?.message).toEqual({rate: 24_000});
        expect(playback.connections).toEqual([made(FakeGain)]);
        expect(made(FakeGain).connections).toEqual([made(FakeStreamDestination)]);

        const pcm = new Int16Array(480);
        audio.enqueue(3, pcm);
        expect(playback.port.posted.at(-1)).toEqual({message: {enqueue: true, eventId: 3, pcm}, transfer: [pcm.buffer]});
        audio.pause();
        audio.resume();
        expect(playback.port.posted.slice(-2).map((posted) => posted.message)).toEqual([{pause: true}, {resume: true}]);

        const ended: number[] = [];
        audio.onPlaybackEnd = (eventId) => ended.push(eventId);
        playback.port.onmessage?.({data: {playing: 4, played: {3: 20, 4: 40}, ended: [3], level: 0.5}});
        expect([audio.playing, audio.playedMs(3), audio.playedMs(4), audio.outputLevel()]).toEqual([4, 20, 40, 0.5]);
        expect(ended).toEqual([3]);
        audio.setVolume(0.3);
        expect(made(FakeGain).gain.value).toBe(0.3);
        audio.drop();
        expect(playback.port.posted.at(-1)?.message).toEqual({drop: true});
        expect([audio.playing, audio.outputLevel()]).toEqual([null, 0]);
    });

    test("close stops the tracks it opened and frees the worklet's URL", async () => {
        const output = element();
        const audio = new BrowserAudio({element: output});
        await audio.startCapture();
        audio.startPlayback(16_000);
        const url = context().modules[0];
        await audio.close();
        expect(microphone.tracks[0]?.stopped).toBe(true);
        expect(revoked).toHaveBeenCalledWith(url);
        expect(context().close).toHaveBeenCalled();
        expect([node("naiuz-capture").disconnected, node("naiuz-playback").disconnected, made(FakeSource).disconnected]).toEqual([true, true, true]);
        expect([output.srcObject, output.paused]).toEqual([null, true]);

        // A context the app gave stays the app's to close.
        const given = new FakeContext();
        const other = new BrowserAudio({context: given as unknown as AudioContext, element: element()});
        await other.startCapture();
        await other.close();
        expect(given.close).not.toHaveBeenCalled();
    });
});

test("a call without the audio option asks for the microphone at once, through BrowserAudio", async () => {
    const sockets = fakeSockets();
    const started = Conversation.startSession({token: "tok", WebSocket: sockets.factory, textOnly: false});
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(context().resume).toHaveBeenCalled();
    await vi.waitFor(() => {
        expect(sockets.opened).toBe(1);
    });
    sockets.socket.open();
    sockets.socket.serverSends(callMetadata());
    const conversation = await started;
    expect(node("naiuz-playback").port.posted[0]?.message).toEqual({rate: 24_000});
    await conversation.endSession();
    expect(context().close).toHaveBeenCalled();
});
