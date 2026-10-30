/**
 * A call's audio: the microphone in, the agent's voice out. BrowserAudio is the browser's; a test, or another
 * runtime, can bring its own.
 */
export interface AudioIO {
    /** Asks for the microphone and starts capture; rejects with the browser's error when refused or missing. */
    startCapture(): Promise<void>;
    /** Starts playback at the reply's rate, the metadata's audio.output. */
    startPlayback(rate: number): void;
    /** Each 20 ms microphone frame: 320 samples at 16 kHz, silent while muted. */
    onFrame: ((pcm: Int16Array) => void) | null;
    /** Called once when a reply's queued audio has all played. */
    onPlaybackEnd: ((eventId: number) => void) | null;
    enqueue(eventId: number, pcm: Int16Array): void;
    pause(): void;
    resume(): void;
    drop(): void;
    /** The reply being heard, or null. */
    readonly playing: number | null;
    /** Milliseconds of that reply's audio played since its first frame, pauses excluded. */
    playedMs(eventId: number): number;
    setMuted(muted: boolean): void;
    setVolume(volume: number): void;
    /** 0 to 1. */
    inputLevel(): number;
    outputLevel(): number;
    close(): Promise<void>;
}
