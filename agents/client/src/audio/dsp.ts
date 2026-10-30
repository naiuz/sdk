// The audio worklets' signal processing. Each piece stands alone, without imports or anything outside itself,
// because its source is copied into the worklet module (see worklets.ts) as well as run here.

/**
 * Takes the microphone from the context's rate to 16 kHz frames of 20 ms. Each output sample is the mean of the
 * input it covers, part samples included, so any input rate divides evenly.
 */
export class Downsampler {
    /** An output sample's length, in units where an input sample is 16 000 long. */
    private readonly span: number;
    private filled = 0;
    private sum = 0;
    private frame = new Int16Array(320);
    private size = 0;

    constructor(inputRate: number) {
        this.span = inputRate;
    }

    /** The 320-sample frames the samples complete; a part frame waits for the next push. */
    push(samples: Float32Array): Int16Array[] {
        const frames: Int16Array[] = [];
        for (const sample of samples) {
            let left = 16_000;
            while (left > 0) {
                const take = Math.min(left, this.span - this.filled);
                this.sum += sample * take;
                this.filled += take;
                left -= take;
                if (this.filled < this.span) continue;
                const value = Math.round((this.sum / this.span) * 32_768);
                this.frame[this.size++] = Math.max(-32_768, Math.min(32_767, value));
                this.sum = 0;
                this.filled = 0;
                if (this.size < 320) continue;
                frames.push(this.frame);
                this.frame = new Int16Array(320);
                this.size = 0;
            }
        }
        return frames;
    }
}

/**
 * The agent's replies waiting to play, in order, read at the context's rate from their own by linear interpolation.
 * It counts how much of each reply has played, pauses excluded, and which replies have played out.
 */
export class PlaybackQueue {
    private readonly chunks: {eventId: number; pcm: Int16Array}[] = [];
    /** Where the first chunk is being read, in its samples. */
    private position = 0;
    private rate: number;
    private step = 1;
    private paused = false;
    /** Each reply's samples played, in its own rate's samples. */
    private readonly played = new Map<number, number>();
    private readonly ended = new Set<number>();
    private endedSince: number[] = [];

    constructor(private readonly contextRate: number) {
        this.rate = contextRate;
    }

    /** The replies' rate: the call's output. */
    setRate(rate: number): void {
        this.rate = rate;
        this.step = rate / this.contextRate;
    }

    enqueue(eventId: number, pcm: Int16Array): void {
        if (pcm.length > 0) this.chunks.push({eventId, pcm});
    }

    /** The reply in front, or null when nothing waits. */
    get current(): number | null {
        return this.chunks[0]?.eventId ?? null;
    }

    /** Fills the block with what plays next: silence when nothing waits or the queue is paused. */
    pull(out: Float32Array): void {
        for (let i = 0; i < out.length; i++) {
            const chunk = this.chunks[0];
            if (this.paused || chunk === undefined) {
                out[i] = 0;
                continue;
            }
            const at = Math.floor(this.position);
            const here = chunk.pcm[at] ?? 0;
            const after = this.chunks[1];
            const next = at + 1 < chunk.pcm.length ? (chunk.pcm[at + 1] ?? here) : after?.eventId === chunk.eventId ? (after.pcm[0] ?? here) : here;
            out[i] = (here + (next - here) * (this.position - at)) / 32_768;
            this.position += this.step;
            this.played.set(chunk.eventId, (this.played.get(chunk.eventId) ?? 0) + this.step);
            if (this.position < chunk.pcm.length) continue;
            this.chunks.shift();
            this.position = this.chunks.length === 0 ? 0 : this.position - chunk.pcm.length;
            if (this.chunks[0]?.eventId !== chunk.eventId && !this.ended.has(chunk.eventId)) {
                this.ended.add(chunk.eventId);
                this.endedSince.push(chunk.eventId);
            }
        }
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    /** Empties every reply; what comes next plays. */
    drop(): void {
        this.chunks.length = 0;
        this.position = 0;
        this.paused = false;
    }

    /** Milliseconds of the reply played since its first sample, pauses excluded. */
    playedMs(eventId: number): number {
        return ((this.played.get(eventId) ?? 0) / this.rate) * 1000;
    }

    /** The replies whose audio played out since the last call, each once. */
    takeEnded(): number[] {
        const ended = this.endedSince;
        this.endedSince = [];
        return ended;
    }
}

/** How loud a block is, for the orb: four times its RMS, at most 1. */
export function level(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}
