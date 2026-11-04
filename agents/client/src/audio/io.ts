/** What plays under the agent, as the builder set it. The agent never hears it. */
export interface AudioEnvironment {
    /** The sound's whole address, or null for none. */
    ambienceUrl: string | null;
    /** 0 to 1. */
    volume: number;
    /** The agent's voice as on a phone line. */
    phoneFilter: boolean;
}

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
    /** Called each time a reply's queued audio has all played: at its end, or early, as after a stall. */
    onPlaybackEnd: ((eventId: number) => void) | null;
    enqueue(eventId: number, pcm: Int16Array): void;
    pause(): void;
    resume(): void;
    drop(): void;
    /** Plays what the call's metadata says goes under the agent. An AudioIO without it plays the agent alone. */
    setEnvironment?(environment: AudioEnvironment): void;
    /** Resolves once what's queued has played, or at the limit, for a goodbye to finish. */
    drain?(limitMs: number): Promise<void>;
    /** Moves the call to this microphone without dropping it. When it can't, the one it has goes on. */
    changeInputDevice?(deviceId: string): Promise<void>;
    /** Sends the agent's voice to this speaker. When it can't, the one it has goes on. */
    changeOutputDevice?(deviceId: string): Promise<void>;
    /** The microphone stopped by itself: unplugged, or its permission taken back. The call goes on, with silence. */
    onInputLost?: (() => void) | null;
    /** Turns the microphone off while what's playing plays on. */
    stopCapture?(): void;
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
