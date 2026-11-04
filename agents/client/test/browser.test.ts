import {beforeEach, describe, expect, test, vi} from "vitest";
import type {MockInstance} from "vitest";
import {BrowserAudio, Conversation, MicrophoneError} from "../src/index";
import {callMetadata, fakeSockets} from "./fake-socket";

class FakeTrack {
    stopped = false;
    onended: (() => void) | null = null;

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

class FakeBiquad extends FakeNode {
    type = "";
    readonly frequency = {value: 0};
}

class FakeBufferSource extends FakeNode {
    buffer: unknown = null;
    loop = false;
    loopStart = 0;
    loopEnd = 0;
    started: [number, number] | null = null;
    stopped = false;

    start(when: number, offset: number): void {
        this.started = [when, offset];
    }

    stop(): void {
        this.stopped = true;
    }
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

    createBiquadFilter(): FakeBiquad {
        return this.keep(new FakeBiquad());
    }

    createBufferSource(): FakeBufferSource {
        return this.keep(new FakeBufferSource());
    }

    readonly decodeAudioData = vi.fn(() =>
        Promise.resolve({duration: 30, sampleRate: 1_000, numberOfChannels: 1, getChannelData: () => this.decoded}),
    );
    decoded = new Float32Array(30_000);

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
    sinkId = "";
    setSinkId?: (id: string) => Promise<void> = (id) => {
        this.sinkId = id;
        return Promise.resolve();
    };
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

describe("what plays under the agent", () => {
    function sound(): void {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))})));
    }

    async function loaded(): Promise<void> {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    }

    async function started(): Promise<{audio: BrowserAudio; context: FakeContext}> {
        const audio = new BrowserAudio();
        await audio.startCapture();
        audio.startPlayback(24_000);
        return {audio, context: contexts.at(-1) as FakeContext};
    }

    const CAFE = {ambienceUrl: "https://my.neuronai.uz/api/v1/realtime/ambience/cafe.mp3", volume: 0.4, phoneFilter: false};

    function sources(context: FakeContext): FakeBufferSource[] {
        return context.made.filter((node): node is FakeBufferSource => node instanceof FakeBufferSource);
    }

    test("a background loops, past the MP3's padding, at its volume, into the agent's output", async () => {
        sound();
        const {audio, context} = await started();

        audio.setEnvironment(CAFE);
        await loaded();

        const [source] = sources(context);
        expect(fetch).toHaveBeenCalledWith(CAFE.ambienceUrl);
        expect(source?.loop).toBe(true);
        expect(source?.loopStart).toBeCloseTo(0.06);
        expect(source?.loopEnd).toBeCloseTo(29.94);
        expect(source?.started).toEqual([0, 0.06]);
        const gain = source?.connections[0] as FakeGain;
        expect(gain.gain.value).toBe(0.4);
    });

    test("the loop's seam runs on, with no jump where it comes round", async () => {
        sound();
        const {audio, context} = await started();
        context.decoded = Float32Array.from({length: 30_000}, (_, i) => Math.sin(i * 12.9898) * 0.5);
        const before = context.decoded[59];

        audio.setEnvironment(CAFE);
        await loaded();

        // The loop runs from 60 to 29,940 here: its last sample is now the one before its first.
        expect(context.decoded[29_939]).toBeCloseTo(before as number);
    });

    test("another background replaces the last, and none stops it", async () => {
        sound();
        const {audio, context} = await started();
        audio.setEnvironment(CAFE);
        await loaded();

        audio.setEnvironment({...CAFE, ambienceUrl: "https://my.neuronai.uz/api/v1/realtime/ambience/city.mp3"});
        await loaded();
        const [cafe, city] = sources(context);
        expect(cafe?.stopped).toBe(true);
        expect(city?.stopped).toBe(false);

        audio.setEnvironment({...CAFE, ambienceUrl: null});
        expect(city?.stopped).toBe(true);
    });

    test("a sound overtaken while it loaded isn't started", async () => {
        sound();
        const {audio, context} = await started();

        audio.setEnvironment(CAFE);
        audio.setEnvironment({...CAFE, ambienceUrl: null});
        await loaded();

        expect(sources(context)).toEqual([]);
    });

    test("the same background on a reconnect isn't started twice", async () => {
        sound();
        const {audio, context} = await started();

        audio.setEnvironment(CAFE);
        await loaded();
        audio.setEnvironment(CAFE);
        await loaded();

        expect(sources(context)).toHaveLength(1);
    });

    test.each([
        ["the network", () => Promise.reject(new TypeError("Failed to fetch"))],
        ["a refusal", () => Promise.resolve({ok: false})],
    ])("a background that won't load, through %s, is no background", async (_how, answer) => {
        vi.stubGlobal("fetch", vi.fn(answer));
        const {audio, context} = await started();

        audio.setEnvironment(CAFE);
        await loaded();

        expect(sources(context)).toHaveLength(0);
    });

    test("a background that can't be decoded is no background", async () => {
        sound();
        const {audio, context} = await started();
        context.decodeAudioData.mockRejectedValueOnce(new Error("bad audio"));

        audio.setEnvironment(CAFE);
        await loaded();

        expect(sources(context)).toHaveLength(0);
    });

    test("one that arrives after the call ended isn't started", async () => {
        sound();
        const {audio, context} = await started();

        audio.setEnvironment(CAFE);
        await audio.close();
        await loaded();

        expect(sources(context)).toHaveLength(0);
    });

    test("closing the call stops it", async () => {
        sound();
        const {audio, context} = await started();
        audio.setEnvironment(CAFE);
        await loaded();

        await audio.close();

        expect(sources(context)[0]?.stopped).toBe(true);
    });

    test("no background asked for fetches nothing", async () => {
        sound();
        const {audio} = await started();

        audio.setEnvironment({...CAFE, ambienceUrl: null});
        await loaded();

        expect(fetch).not.toHaveBeenCalled();
    });

    test("the phone filter puts a telephone's band between the agent and its output", async () => {
        const {audio, context} = await started();
        const playback = workletNodes.find((node) => node.name === "naiuz-playback") as FakeWorkletNode;

        audio.setEnvironment({...CAFE, ambienceUrl: null, phoneFilter: true});

        const [low, high] = context.made.filter((node): node is FakeBiquad => node instanceof FakeBiquad);
        expect([low?.type, low?.frequency.value]).toEqual(["highpass", 300]);
        expect([high?.type, high?.frequency.value]).toEqual(["lowpass", 3_400]);
        expect(playback.connections.at(-1)).toBe(low);
        expect(low?.connections[0]).toBe(high);
    });

    test("off, the agent goes straight to its output", async () => {
        const {audio, context} = await started();
        const playback = workletNodes.find((node) => node.name === "naiuz-playback") as FakeWorkletNode;
        const direct = playback.connections.at(-1);

        audio.setEnvironment({...CAFE, ambienceUrl: null, phoneFilter: false});

        expect(context.made.filter((node) => node instanceof FakeBiquad)).toHaveLength(0);
        expect(playback.connections.at(-1)).toBe(direct);
    });
});

describe("a goodbye", () => {
    async function playing(): Promise<{audio: BrowserAudio; playback: FakeWorkletNode}> {
        const audio = new BrowserAudio();
        await audio.startCapture();
        audio.startPlayback(24_000);
        const playback = workletNodes.find((node) => node.name === "naiuz-playback") as FakeWorkletNode;
        playback.port.onmessage?.({data: {playing: 7, played: {7: 100}, ended: [], level: 0.5}});
        return {audio, playback};
    }

    test("draining waits for what's playing to finish", async () => {
        const {audio, playback} = await playing();
        let done = false;

        void audio.drain(2_000).then(() => {
            done = true;
        });
        await Promise.resolve();
        expect(done).toBe(false);

        playback.port.onmessage?.({data: {playing: null, played: {7: 400}, ended: [7], level: 0}});
        await Promise.resolve();
        await Promise.resolve();
        expect(done).toBe(true);
    });

    test("it can't hold the speaker past its limit", async () => {
        vi.useFakeTimers();
        const {audio} = await playing();
        let done = false;

        void audio.drain(2_000).then(() => {
            done = true;
        });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(done).toBe(true);
        vi.useRealTimers();
    });

    test("what was just handed over counts, before the worklet has said so", async () => {
        vi.useFakeTimers();
        const audio = new BrowserAudio();
        await audio.startCapture();
        audio.startPlayback(24_000);
        const playback = workletNodes.find((node) => node.name === "naiuz-playback") as FakeWorkletNode;
        let done = false;

        audio.enqueue(7, new Int16Array(4_800));
        void audio.drain(2_000).then(() => {
            done = true;
        });
        // A report made before the worklet took the audio still says nothing plays.
        playback.port.onmessage?.({data: {playing: null, played: {}, ended: [], level: 0}});
        await vi.advanceTimersByTimeAsync(50);
        expect(done).toBe(false);

        playback.port.onmessage?.({data: {playing: 7, played: {7: 40}, ended: [], level: 0.5}});
        await vi.advanceTimersByTimeAsync(200);
        expect(done).toBe(false);

        playback.port.onmessage?.({data: {playing: null, played: {7: 200}, ended: [7], level: 0}});
        await vi.advanceTimersByTimeAsync(0);
        expect(done).toBe(true);
        vi.useRealTimers();
    });

    test("audio handed over that never starts doesn't hold the speaker", async () => {
        vi.useFakeTimers();
        const audio = new BrowserAudio();
        await audio.startCapture();
        audio.startPlayback(24_000);
        let done = false;

        audio.enqueue(7, new Int16Array(0));
        void audio.drain(2_000).then(() => {
            done = true;
        });
        await vi.advanceTimersByTimeAsync(300);

        expect(done).toBe(true);
        vi.useRealTimers();
    });

    test("the microphone stops on its own, and the speaker stays", async () => {
        const audio = new BrowserAudio();
        await audio.startCapture();

        audio.stopCapture();

        expect((contexts.at(-1) as FakeContext).state).not.toBe("closed");
        expect(microphone.tracks[0]?.stopped).toBe(true);
    });

    test("with nothing playing there's nothing to wait for", async () => {
        const audio = new BrowserAudio();
        await audio.startCapture();

        await expect(audio.drain(2_000)).resolves.toBeUndefined();
    });
});

describe("changing devices", () => {
    async function capturing() {
        const element = new FakeElement();
        const audio = new BrowserAudio({element: element as unknown as HTMLMediaElement});
        await audio.startCapture();
        return {audio, element, context: contexts[0] as unknown as FakeContext};
    }

    test("moves to the new microphone, with its constraints, and lets go of the old one", async () => {
        const {audio, context} = await capturing();
        const oldTrack = microphone.tracks[0] as FakeTrack;
        const sources = () => context.made.filter((node): node is FakeSource => node instanceof FakeSource);
        const [oldSource] = sources();
        const next = new FakeStream();
        getUserMedia.mockResolvedValueOnce(next);

        await audio.changeInputDevice("mic-2");

        expect(getUserMedia.mock.lastCall?.[0]).toMatchObject({audio: {echoCancellation: true, deviceId: {exact: "mic-2"}}});
        expect(oldTrack.stopped).toBe(true);
        expect(oldSource?.disconnected).toBe(true);
        const newSource = sources().at(-1);
        expect(newSource?.mediaStream).toBe(next);
        expect(newSource?.connections).toContain(workletNodes[0]);
    });

    test("a microphone that's gone leaves the old one working", async () => {
        const {audio} = await capturing();
        const oldTrack = microphone.tracks[0] as FakeTrack;
        getUserMedia.mockRejectedValueOnce(Object.assign(new Error("gone"), {name: "NotFoundError"}));

        await expect(audio.changeInputDevice("mic-2")).rejects.toBeInstanceOf(MicrophoneError);

        expect(oldTrack.stopped).toBe(false);
    });

    test("a change that comes back after the call closed lets the new microphone go", async () => {
        const {audio} = await capturing();
        const next = new FakeStream();
        let answer: (stream: unknown) => void = () => undefined;
        getUserMedia.mockReturnValueOnce(new Promise((resolve) => {
            answer = resolve;
        }));
        const changing = audio.changeInputDevice("mic-2");
        await audio.close();
        answer(next);
        await changing;
        expect((next.tracks[0] as FakeTrack).stopped).toBe(true);
    });

    function answering() {
        const answers: ((stream: unknown) => void)[] = [];
        getUserMedia.mockImplementation(() => new Promise((resolve) => {
            answers.push(resolve);
        }));
        return answers;
    }

    test("of two quick picks the newest wins whichever answers first, and the other is let go", async () => {
        const {audio, context} = await capturing();
        const answers = answering();
        const [first, second] = [new FakeStream(), new FakeStream()];
        const changes = [audio.changeInputDevice("mic-a"), audio.changeInputDevice("mic-b")];
        answers[1]?.(second);
        await changes[1];
        answers[0]?.(first);
        await changes[0];

        expect((first.tracks[0] as FakeTrack).stopped).toBe(true);
        expect((second.tracks[0] as FakeTrack).stopped).toBe(false);
        const sources = context.made.filter((node): node is FakeSource => node instanceof FakeSource);
        expect(sources.at(-1)?.mediaStream).toBe(second);
    });

    test("two quick picks answered in order leave no microphone open after the call", async () => {
        const {audio} = await capturing();
        const answers = answering();
        const [first, second] = [new FakeStream(), new FakeStream()];
        const changes = [audio.changeInputDevice("mic-a"), audio.changeInputDevice("mic-b")];
        answers[0]?.(first);
        await changes[0];
        answers[1]?.(second);
        await changes[1];
        await audio.close();

        expect((first.tracks[0] as FakeTrack).stopped).toBe(true);
        expect((second.tracks[0] as FakeTrack).stopped).toBe(true);
    });

    test("sends the agent's voice to the chosen speaker", async () => {
        const {audio, element} = await capturing();
        await audio.changeOutputDevice("speaker-2");
        expect(element.sinkId).toBe("speaker-2");
    });

    test("a browser that can't choose a speaker says so", async () => {
        const {audio, element} = await capturing();
        element.setSinkId = undefined;
        await expect(audio.changeOutputDevice("speaker-2")).rejects.toThrow(/can't choose/);
    });

    test("says when the microphone stops by itself", async () => {
        const {audio} = await capturing();
        const lost = vi.fn();
        audio.onInputLost = lost;
        (microphone.tracks[0] as FakeTrack).onended?.();
        expect(lost).toHaveBeenCalledOnce();
    });
});
