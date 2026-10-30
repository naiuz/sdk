import {describe, expect, test} from "vitest";
import {Downsampler, level, PlaybackQueue} from "../src/audio/dsp";

function tone(rate: number, frequency: number, amplitude: number, ms: number): Float32Array {
    const samples = new Float32Array((rate * ms) / 1000);
    for (let i = 0; i < samples.length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate);
    return samples;
}

function rms(frames: Int16Array[]): number {
    let sum = 0;
    let count = 0;
    for (const frame of frames) {
        for (const sample of frame) sum += (sample / 32_768) ** 2;
        count += frame.length;
    }
    return Math.sqrt(sum / count);
}

/** Pulls the queue dry in render quanta, returning every sample it gave. */
function drain(queue: PlaybackQueue, quantum = 128): number[] {
    const out = new Float32Array(quantum);
    const samples: number[] = [];
    while (queue.current !== null) {
        queue.pull(out);
        samples.push(...out);
    }
    return samples;
}

describe("the downsampler", () => {
    test("a 48 kHz tone comes out as 16 kHz frames of 320 samples at its level", () => {
        const frames = new Downsampler(48_000).push(tone(48_000, 1000, 0.5, 200));
        expect(frames.map((frame) => frame.length)).toEqual(new Array<number>(10).fill(320));
        expect(Math.abs(rms(frames) - 0.354) / 0.354).toBeLessThan(0.05);
    });

    test("pushing in small blocks gives the same frames as one push", () => {
        const input = tone(44_100, 440, 0.8, 300);
        const whole = new Downsampler(44_100).push(input);
        const inBlocks = new Downsampler(44_100);
        const frames: Int16Array[] = [];
        for (let at = 0; at < input.length; at += 128) frames.push(...inBlocks.push(input.subarray(at, at + 128)));
        expect(whole).toHaveLength(15);
        expect(frames).toEqual(whole);
    });

    test("each sample is the mean of its span, rounded and clamped to PCM16", () => {
        const input = new Float32Array(960);
        for (let i = 0; i < 960; i += 3) input.set([0.1, 0.2, 0.3], i);
        input.set([1.5, 1.5, 1.5, -2, -2, -2], 0);
        const [frame] = new Downsampler(48_000).push(input);
        expect(Array.from(frame?.subarray(0, 3) ?? [])).toEqual([32_767, -32_768, Math.round(0.2 * 32_768)]);
    });
});

describe("the playback queue", () => {
    test("a 24 kHz reply plays its full length on a 48 kHz context", () => {
        const queue = new PlaybackQueue(48_000);
        queue.setRate(24_000);
        queue.enqueue(1, new Int16Array(24 * 480).fill(16_384));
        const played = drain(queue).filter((sample) => sample !== 0);
        expect(queue.playedMs(1)).toBe(480);
        expect(played).toHaveLength(2 * 24 * 480);
        expect(new Set(played)).toEqual(new Set([0.5]));
    });

    test("pause keeps the place, resume carries on, and paused time isn't played", () => {
        const queue = new PlaybackQueue(16_000);
        queue.setRate(16_000);
        queue.enqueue(1, Int16Array.from({length: 1600}, (_, i) => i));
        const out = new Float32Array(160);
        queue.pull(out);
        expect(out[159]).toBe(159 / 32_768);
        queue.pause();
        queue.pull(out);
        expect(out.every((sample) => sample === 0)).toBe(true);
        expect(queue.playedMs(1)).toBe(10);
        expect(queue.current).toBe(1);
        queue.resume();
        queue.pull(out);
        expect(out[0]).toBe(160 / 32_768);
        expect(queue.playedMs(1)).toBe(20);
    });

    test("drop empties every reply", () => {
        const queue = new PlaybackQueue(16_000);
        queue.setRate(16_000);
        queue.enqueue(1, new Int16Array(320).fill(100));
        queue.enqueue(2, new Int16Array(320).fill(200));
        queue.pause();
        queue.drop();
        expect(queue.current).toBeNull();
        const out = new Float32Array(160);
        queue.pull(out);
        expect(out.every((sample) => sample === 0)).toBe(true);
        expect(queue.takeEnded()).toEqual([]);
        // What comes next plays: a drop doesn't leave the queue paused.
        queue.enqueue(3, new Int16Array(160).fill(300));
        queue.pull(out);
        expect(out[0]).toBe(300 / 32_768);
    });

    test("each reply's end is taken once, also for two replies back to back", () => {
        const queue = new PlaybackQueue(16_000);
        queue.setRate(16_000);
        queue.enqueue(1, new Int16Array(160).fill(1));
        queue.enqueue(2, new Int16Array(80).fill(2));
        queue.enqueue(2, new Int16Array(80).fill(2));
        const out = new Float32Array(240);
        queue.pull(out);
        expect(queue.takeEnded()).toEqual([1]);
        expect(queue.takeEnded()).toEqual([]);
        expect(queue.current).toBe(2);
        queue.pull(out);
        expect(queue.takeEnded()).toEqual([2]);
        // More audio for a reply that played out plays, and doesn't end it twice.
        queue.enqueue(2, new Int16Array(160).fill(2));
        queue.pull(out);
        expect(queue.takeEnded()).toEqual([]);
        expect([queue.playedMs(1), queue.playedMs(2)]).toEqual([10, 20]);
    });
});

test("level is four times the RMS, at most 1", () => {
    expect(level(new Float32Array(128).fill(0.1))).toBeCloseTo(0.4);
    expect(level(new Float32Array(128).fill(-0.5))).toBe(1);
    expect(level(new Float32Array(0))).toBe(0);
});
