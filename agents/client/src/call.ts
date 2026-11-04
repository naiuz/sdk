import type {AudioIO} from "./audio/io";
import {decodeAgentAudio, encodeUserAudio, HEADER_BYTES} from "./frames";

/** How often the reply being heard has its position reported. */
export const REPORT_EVERY_MS = 250;
/** A microphone frame that would leave the socket holding more than this unsent, about a second of audio, is dropped. */
export const STALL_BUFFERED_BYTES = 32_768;

/** What a call needs of its connection. */
export interface CallSocket {
    send(data: string | Uint8Array): void;
    /** The bytes the socket holds unsent. */
    buffered(): number;
}

/**
 * One connection's side of a call: the microphone's frames out, the agent's audio in, and playback reports, so the
 * server knows what the customer heard. A reconnect makes a new one, numbering frames from 0 again.
 */
export class Call {
    private sequence = 0;
    private readonly reported = new Map<number, number>();
    /** Replies at or below this event id were interrupted: audio still on its way for them isn't played. */
    private droppedThrough = 0;
    private readonly clock: ReturnType<typeof setInterval>;
    private stopped = false;

    constructor(private readonly socket: CallSocket, private readonly audio: AudioIO, rate: number) {
        audio.startPlayback(rate);
        audio.onFrame = (pcm) => {
            this.frame(pcm);
        };
        audio.onPlaybackEnd = (eventId) => {
            this.report(eventId);
        };
        this.clock = setInterval(() => {
            const playing = this.audio.playing;
            if (playing !== null) this.report(playing);
        }, REPORT_EVERY_MS);
    }

    /** A microphone frame. After a stall, one the socket can't take yet is dropped, and its number goes with it. */
    frame(pcm: Int16Array): void {
        if (this.stopped) return;
        const sequence = this.sequence++;
        if (this.socket.buffered() + HEADER_BYTES + pcm.byteLength > STALL_BUFFERED_BYTES) return;
        this.socket.send(encodeUserAudio(sequence, pcm));
    }

    /** A binary frame from the server. */
    agentAudio(data: ArrayBuffer): void {
        const audio = decodeAgentAudio(data);
        if (this.stopped || audio === null || audio.eventId <= this.droppedThrough) return;
        this.audio.enqueue(audio.eventId, audio.pcm);
    }

    /** The customer spoke over the reply: it waits, keeping its place, for the server's word. */
    pause(eventId: number): void {
        this.audio.pause();
        this.report(eventId, true);
    }

    resume(): void {
        this.audio.resume();
    }

    /** The reply was cut off: where it stopped is reported, then its audio is dropped. */
    interrupt(eventId: number): void {
        this.report(eventId, true);
        this.droppedThrough = Math.max(this.droppedThrough, eventId);
        this.audio.drop();
    }

    /** The socket closed: nothing more is sent, and what was playing is dropped unless it's a goodbye to finish. */
    stop(letItFinish = false): void {
        if (this.stopped) return;
        this.stopped = true;
        clearInterval(this.clock);
        this.audio.onFrame = null;
        this.audio.onPlaybackEnd = null;
        if (!letItFinish) this.audio.drop();
    }

    /** Reports the reply's position: on the clock and at its end only when it moved, at a pause or interruption always. */
    private report(eventId: number, always = false): void {
        if (this.stopped) return;
        const played = Math.floor(this.audio.playedMs(eventId));
        if (!always && this.reported.get(eventId) === played) return;
        this.reported.set(eventId, played);
        this.socket.send(JSON.stringify({type: "playback", event_id: eventId, played_ms: played}));
    }
}
