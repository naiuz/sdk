import type {AudioIO} from "../src/index";

/** One thing the client asked of the audio, in order. */
export type AudioCall =
    | {call: "startCapture"}
    | {call: "startPlayback"; rate: number}
    | {call: "enqueue"; eventId: number; samples: number}
    | {call: "pause"}
    | {call: "resume"}
    | {call: "drop"}
    | {call: "setEnvironment"; ambienceUrl: string | null; volume: number; phoneFilter: boolean}
    | {call: "drain"; limitMs: number}
    | {call: "stopCapture"}
    | {call: "setMuted"; muted: boolean}
    | {call: "setVolume"; volume: number}
    | {call: "close"};

/** The value of every sample in the nth microphone frame, counting from 1: its bytes differ, so their order shows. */
export function micSample(n: number): number {
    return 0x1234 + n;
}

/**
 * An AudioIO the test drives by its clock, as a sound card would run: it records every call, captures a 20 ms
 * frame on each 20 ms from startCapture, and plays what it is given in real time.
 */
export class FakeAudio implements AudioIO {
    readonly calls: AudioCall[] = [];
    onFrame: ((pcm: Int16Array) => void) | null = null;
    onPlaybackEnd: ((eventId: number) => void) | null = null;
    private refusal: Error | null = null;
    private muted = false;
    private volume = 1;
    private rate = 16_000;
    private captured = 0;
    private capture: ReturnType<typeof setInterval> | null = null;
    /** What is still to play, in order: each reply's run of audio, in ms. */
    private readonly queue: {eventId: number; ms: number}[] = [];
    private readonly played = new Map<number, number>();
    private paused = false;
    private at = Date.now();
    private end: ReturnType<typeof setTimeout> | null = null;

    /** Makes startCapture reject with the error, as a browser does when the microphone is refused or missing. */
    refuse(error: Error): void {
        this.refusal = error;
    }

    startCapture(): Promise<void> {
        this.calls.push({call: "startCapture"});
        if (this.refusal !== null) return Promise.reject(this.refusal);
        this.capture = setInterval(() => {
            this.captured++;
            this.onFrame?.(new Int16Array(320).fill(this.muted ? 0 : micSample(this.captured)));
        }, 20);
        return Promise.resolve();
    }

    startPlayback(rate: number): void {
        this.advance();
        this.calls.push({call: "startPlayback", rate});
        this.rate = rate;
    }

    enqueue(eventId: number, pcm: Int16Array): void {
        this.advance();
        this.calls.push({call: "enqueue", eventId, samples: pcm.length});
        const ms = (pcm.length / this.rate) * 1000;
        const last = this.queue.at(-1);
        if (last?.eventId === eventId) {
            last.ms += ms;
        } else {
            this.queue.push({eventId, ms});
        }
        this.schedule();
    }

    pause(): void {
        this.advance();
        this.calls.push({call: "pause"});
        this.paused = true;
        this.schedule();
    }

    resume(): void {
        this.advance();
        this.calls.push({call: "resume"});
        this.paused = false;
        this.schedule();
    }

    setEnvironment(environment: {ambienceUrl: string | null; volume: number; phoneFilter: boolean}): void {
        this.calls.push({call: "setEnvironment", ...environment});
    }

    /** Set by a test to hold a goodbye open. */
    finishDraining: (() => void) | null = null;

    stopCapture(): void {
        this.calls.push({call: "stopCapture"});
    }

    drain(limitMs: number): Promise<void> {
        this.calls.push({call: "drain", limitMs});
        return new Promise((resolve) => {
            this.finishDraining = resolve;
        });
    }

    drop(): void {
        this.advance();
        this.calls.push({call: "drop"});
        this.queue.length = 0;
        this.paused = false;
        this.schedule();
    }

    get playing(): number | null {
        this.advance();
        return this.queue[0]?.eventId ?? null;
    }

    playedMs(eventId: number): number {
        this.advance();
        return this.played.get(eventId) ?? 0;
    }

    setMuted(muted: boolean): void {
        this.calls.push({call: "setMuted", muted});
        this.muted = muted;
    }

    setVolume(volume: number): void {
        this.calls.push({call: "setVolume", volume});
        this.volume = volume;
    }

    inputLevel(): number {
        return this.capture === null || this.muted ? 0 : 0.5;
    }

    outputLevel(): number {
        return this.playing === null || this.paused ? 0 : 0.25 * this.volume;
    }

    close(): Promise<void> {
        this.calls.push({call: "close"});
        if (this.capture !== null) clearInterval(this.capture);
        if (this.end !== null) clearTimeout(this.end);
        this.capture = null;
        this.end = null;
        return Promise.resolve();
    }

    /** Plays the time since the last look, reply by reply, calling onPlaybackEnd each time a reply's audio runs out. */
    private advance(): void {
        const now = Date.now();
        let elapsed = now - this.at;
        this.at = now;
        if (this.paused) return;
        while (elapsed > 0) {
            const head = this.queue[0];
            if (head === undefined) return;
            const step = Math.min(elapsed, head.ms);
            this.played.set(head.eventId, (this.played.get(head.eventId) ?? 0) + step);
            head.ms -= step;
            elapsed -= step;
            if (head.ms > 0) continue;
            this.queue.shift();
            this.onPlaybackEnd?.(head.eventId);
        }
    }

    /** Wakes when the reply in front runs out, so its end comes on time. */
    private schedule(): void {
        if (this.end !== null) clearTimeout(this.end);
        this.end = null;
        const head = this.queue[0];
        if (head === undefined || this.paused) return;
        this.end = setTimeout(() => {
            this.end = null;
            this.advance();
            this.schedule();
        }, head.ms);
    }
}
