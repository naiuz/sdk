import {expect, test} from "vitest";
import {workletSource} from "../src/audio/worklets";

interface Posted {
    message: Record<string, unknown>;
    transfer: Transferable[] | undefined;
}

/** A worklet's end of its MessagePort: the test reads what it posts and delivers what the main thread would. */
class FakePort {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    readonly posted: Posted[] = [];

    postMessage(message: Record<string, unknown>, transfer?: Transferable[]): void {
        this.posted.push({message, transfer});
    }

    deliver(data: unknown): void {
        this.onmessage?.({data});
    }
}

interface Processor {
    port: FakePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

/** Evaluates the module as an AudioWorkletGlobalScope would, with only its globals in reach. */
function load(sampleRate: number): Map<string, new () => Processor> {
    const processors = new Map<string, new () => Processor>();
    class AudioWorkletProcessor {
        readonly port = new FakePort();
    }
    const registerProcessor = (name: string, processor: new () => Processor) => {
        processors.set(name, processor);
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the module is a script for another global scope
    const module = new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", workletSource()) as (...globals: unknown[]) => void;
    module(AudioWorkletProcessor, registerProcessor, sampleRate);
    return processors;
}

function processor(sampleRate: number, name: string): Processor {
    const Made = load(sampleRate).get(name);
    if (Made === undefined) throw new Error(`${name} isn't registered`);
    return new Made();
}

test("the worklet module registers both processors", () => {
    expect([...load(48_000).keys()]).toEqual(["naiuz-capture", "naiuz-playback"]);
});

test("the capture processor posts 20 ms frames, silent when muted", () => {
    const capture = processor(48_000, "naiuz-capture");
    // 20 ms at 48 kHz is 960 samples: seven and a half render quanta.
    for (let i = 0; i < 8; i++) expect(capture.process([[new Float32Array(128).fill(0.25)]], [])).toBe(true);
    expect(capture.port.posted).toHaveLength(1);
    const [first] = capture.port.posted;
    const frame = first?.message.frame as Int16Array;
    expect(frame).toEqual(new Int16Array(320).fill(8192));
    expect(first?.transfer).toEqual([frame.buffer]);
    expect(first?.message.level).toBe(1);

    capture.port.deliver({muted: true});
    for (let i = 0; i < 7; i++) capture.process([[new Float32Array(128).fill(0.25)]], []);
    expect(capture.port.posted).toHaveLength(2);
    expect(capture.port.posted[1]?.message).toEqual({frame: new Int16Array(320), level: 0});
    // A quantum without input, as when the track has ended, posts nothing.
    expect(capture.process([[]], [])).toBe(true);
    expect(capture.port.posted).toHaveLength(2);
});

test("the playback processor plays what it's given and reports it", () => {
    const playback = processor(48_000, "naiuz-playback");
    playback.port.deliver({rate: 24_000});
    playback.port.deliver({enqueue: true, eventId: 7, pcm: new Int16Array(480).fill(16_384)});
    const out = new Float32Array(128);
    playback.process([], [[out]]);
    expect(new Set(out)).toEqual(new Set([0.5]));
    for (let i = 1; i < 20; i++) playback.process([], [[out]]);
    expect(out.every((sample) => sample === 0)).toBe(true);
    expect(playback.port.posted.map((posted) => posted.message)).toEqual([{playing: null, played: {7: 20}, ended: [7], level: 1}]);

    // Paused, it plays silence and keeps its place; nothing new to report while nothing plays.
    playback.port.deliver({enqueue: true, eventId: 8, pcm: new Int16Array(480).fill(8192)});
    playback.port.deliver({pause: true});
    for (let i = 0; i < 20; i++) playback.process([], [[out]]);
    expect(out.every((sample) => sample === 0)).toBe(true);
    expect(playback.port.posted.at(-1)?.message).toEqual({playing: 8, played: {8: 0}, ended: [], level: 0});
    playback.port.deliver({resume: true});
    playback.process([], [[out]]);
    expect(out[0]).toBe(0.25);
    // Dropped, it says once that nothing plays, then nothing more while nothing does.
    playback.port.deliver({drop: true});
    for (let i = 0; i < 39; i++) playback.process([], [[out]]);
    expect(playback.port.posted.at(-1)?.message).toEqual({playing: null, played: {}, ended: [], level: 1});
    const count = playback.port.posted.length;
    for (let i = 0; i < 40; i++) playback.process([], [[out]]);
    expect(playback.port.posted).toHaveLength(count);
});
