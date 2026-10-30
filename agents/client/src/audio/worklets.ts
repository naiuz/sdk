import {Downsampler, level, PlaybackQueue} from "./dsp";

/** How many render quanta pass between the playback processor's reports: about 53 ms at 48 kHz. */
const REPORT_QUANTA = 20;

// The processors are plain JavaScript for the AudioWorkletGlobalScope, where AudioWorkletProcessor,
// registerProcessor and sampleRate live. The DSP they use is the tested source above, copied in.
const PROCESSORS = String.raw`
class NaiuzCapture extends AudioWorkletProcessor {
    constructor() {
        super();
        this.downsampler = new Downsampler(sampleRate);
        this.muted = false;
        this.port.onmessage = (event) => {
            if (typeof event.data.muted === "boolean") this.muted = event.data.muted;
        };
    }

    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (!channel || channel.length === 0) return true;
        const loudness = this.muted ? 0 : level(channel);
        for (const frame of this.downsampler.push(channel)) {
            if (this.muted) frame.fill(0);
            this.port.postMessage({frame, level: loudness}, [frame.buffer]);
        }
        return true;
    }
}

class NaiuzPlayback extends AudioWorkletProcessor {
    constructor() {
        super();
        this.queue = new PlaybackQueue(sampleRate);
        this.quanta = 0;
        this.loudest = 0;
        this.wasPlaying = false;
        this.port.onmessage = (event) => {
            const message = event.data;
            if (message.enqueue) this.queue.enqueue(message.eventId, message.pcm);
            else if (message.pause) this.queue.pause();
            else if (message.resume) this.queue.resume();
            else if (message.drop) this.queue.drop();
            else if (typeof message.rate === "number") this.queue.setRate(message.rate);
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output && output[0];
        if (channel) {
            this.queue.pull(channel);
            for (let i = 1; i < output.length; i++) output[i].set(channel);
            this.loudest = Math.max(this.loudest, level(channel));
        }
        if (++this.quanta < ${REPORT_QUANTA}) return true;
        this.quanta = 0;
        const playing = this.queue.current;
        const ended = this.queue.takeEnded();
        // Once nothing plays, it says so once, then stays quiet.
        if (playing !== null || ended.length > 0 || this.wasPlaying) {
            const played = {};
            for (const eventId of playing === null ? ended : [...ended, playing]) played[eventId] = this.queue.playedMs(eventId);
            this.port.postMessage({playing, played, ended, level: this.loudest});
        }
        this.wasPlaying = playing !== null;
        this.loudest = 0;
        return true;
    }
}

registerProcessor("naiuz-capture", NaiuzCapture);
registerProcessor("naiuz-playback", NaiuzPlayback);
`;

/** The AudioWorklet module: the DSP's own source, then the capture and playback processors that use it. */
export function workletSource(): string {
    // Bound to the names the processors use, whatever a bundler named the classes.
    return [
        `const Downsampler = ${Downsampler.toString()};`,
        `const PlaybackQueue = ${PlaybackQueue.toString()};`,
        `const level = ${level.toString()};`,
        PROCESSORS,
    ].join("\n");
}
