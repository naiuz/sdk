import {MicrophoneError} from "../errors";
import type {AudioEnvironment, AudioIO} from "./io";
import {workletSource} from "./worklets";

/** The microphone as the agent should hear it: the browser's echo cancelling, noise suppression and gain control, in mono. */
const MICROPHONE: MediaTrackConstraints = {echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1};

export interface BrowserAudioOptions {
    /** A stream to send in place of the microphone, such as a recording's. */
    inputStream?: MediaStream;
    /** The AudioContext to run in. The default is a new one at the device's rate. */
    context?: AudioContext;
    /** The element the agent plays through. The default is a new <audio>. */
    element?: HTMLAudioElement;
}

/** A telephone's band, for an agent that should sound like it's on one. */
const PHONE_LOW_HZ = 300;
const PHONE_HIGH_HZ = 3_400;
/** What an MP3's encoder pads each end with, which would dip at every repeat. */
const LOOP_TRIM_S = 0.06;

interface CaptureMessage {
    frame: Int16Array;
    level: number;
}

interface PlaybackMessage {
    playing: number | null;
    played: Record<string, number>;
    ended: number[];
    level: number;
}

/**
 * A call's audio in the browser: one AudioContext, with a worklet that takes the microphone to 16 kHz frames and one
 * that plays the agent's replies. The agent plays through a media element, which the browser's echo canceller hears,
 * so the microphone doesn't send the agent back to itself. Make it inside the user's gesture, as startSession does.
 * It serves one session: close() releases it for good.
 */
export class BrowserAudio implements AudioIO {
    onFrame: ((pcm: Int16Array) => void) | null = null;
    onPlaybackEnd: ((eventId: number) => void) | null = null;
    private readonly context: AudioContext;
    private readonly ownsContext: boolean;
    private readonly element: HTMLAudioElement;
    private readonly inputStream: MediaStream | null;
    private readonly gain: GainNode;
    private readonly output: MediaStreamAudioDestinationNode;
    /** The microphone stream this opened, and so must stop. */
    private opened: MediaStream | null = null;
    private moduleUrl: string | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private capture: AudioWorkletNode | null = null;
    private playback: AudioWorkletNode | null = null;
    private connected = false;
    private muted = false;
    private input = 0;
    private loudness = 0;
    private current: number | null = null;
    private readonly played = new Map<number, number>();
    private readonly ambienceGain: GainNode;
    /** The sound asked for, so a reconnect's metadata doesn't start it twice. */
    private ambienceUrl: string | null = null;
    private ambience: AudioBufferSourceNode | null = null;
    private phoneBand: [BiquadFilterNode, BiquadFilterNode] | null = null;
    private drained: (() => void) | null = null;
    private closed = false;

    constructor(options: BrowserAudioOptions = {}) {
        if (options.context === undefined && typeof AudioContext === "undefined") {
            throw new Error("BrowserAudio needs a browser's Web Audio. Outside a browser, give the session an audio option: an AudioIO of your own.");
        }
        this.context = options.context ?? new AudioContext();
        this.ownsContext = options.context === undefined;
        this.element = options.element ?? new Audio();
        this.inputStream = options.inputStream ?? null;
        this.gain = this.context.createGain();
        this.output = this.context.createMediaStreamDestination();
        this.ambienceGain = this.context.createGain();
        this.ambienceGain.connect(this.gain);
    }

    async startCapture(): Promise<void> {
        // Everything a browser lets start only inside the user's gesture starts before the first await.
        const resumed = this.context.state === "suspended" ? this.context.resume() : Promise.resolve();
        const microphone = this.inputStream === null ? this.openMicrophone() : Promise.resolve(this.inputStream);
        this.element.srcObject = this.output.stream;
        this.element.play().catch(() => undefined);
        const [stream] = await Promise.all([microphone, resumed]);
        await this.context.audioWorklet.addModule(this.module());
        this.source = this.context.createMediaStreamSource(stream);
        this.capture = new AudioWorkletNode(this.context, "naiuz-capture", {numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1]});
        this.capture.port.onmessage = (event: MessageEvent<CaptureMessage>) => {
            this.input = this.muted ? 0 : event.data.level;
            this.onFrame?.(event.data.frame);
        };
        this.capture.port.postMessage({muted: this.muted});
        this.source.connect(this.capture);
        // Its output is silence, but a node nothing pulls may never run.
        this.capture.connect(this.context.destination);
        this.playback = new AudioWorkletNode(this.context, "naiuz-playback", {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1]});
        this.playback.port.onmessage = (event: MessageEvent<PlaybackMessage>) => {
            this.heard(event.data);
        };
    }

    startPlayback(rate: number): void {
        const playback = this.playback;
        if (playback === null) return;
        playback.port.postMessage({rate});
        if (!this.connected) {
            this.connected = true;
            this.routeVoice();
            this.gain.connect(this.output);
        }
        if (this.element.paused) this.element.play().catch(() => undefined);
    }

    enqueue(eventId: number, pcm: Int16Array): void {
        this.playback?.port.postMessage({enqueue: true, eventId, pcm}, [pcm.buffer]);
    }

    pause(): void {
        this.playback?.port.postMessage({pause: true});
    }

    resume(): void {
        this.playback?.port.postMessage({resume: true});
    }

    drop(): void {
        this.playback?.port.postMessage({drop: true});
        this.current = null;
        this.loudness = 0;
    }

    setEnvironment(environment: AudioEnvironment): void {
        this.ambienceGain.gain.value = environment.volume;
        const band = environment.phoneFilter;
        if (band !== (this.phoneBand !== null)) {
            this.phoneBand = band ? [this.bandEdge("highpass", PHONE_LOW_HZ), this.bandEdge("lowpass", PHONE_HIGH_HZ)] : null;
            this.routeVoice();
        }
        if (environment.ambienceUrl !== null && environment.ambienceUrl !== this.ambienceUrl) {
            this.ambienceUrl = environment.ambienceUrl;
            void this.playAmbience(environment.ambienceUrl);
        }
    }

    drain(limitMs: number): Promise<void> {
        if (this.current === null) return Promise.resolve();
        return new Promise((resolve) => {
            const done = () => {
                clearTimeout(limit);
                this.drained = null;
                resolve();
            };
            const limit = setTimeout(done, limitMs);
            this.drained = done;
        });
    }

    get playing(): number | null {
        return this.current;
    }

    playedMs(eventId: number): number {
        return this.played.get(eventId) ?? 0;
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (muted) this.input = 0;
        this.capture?.port.postMessage({muted});
    }

    setVolume(volume: number): void {
        this.gain.gain.value = volume;
    }

    inputLevel(): number {
        return this.muted ? 0 : this.input;
    }

    outputLevel(): number {
        return this.current === null ? 0 : this.loudness;
    }

    close(): Promise<void> {
        this.closed = true;
        this.drained?.();
        this.ambience?.stop();
        this.ambience?.disconnect();
        this.ambienceGain.disconnect();
        for (const node of [this.capture, this.playback]) {
            if (node === null) continue;
            node.port.onmessage = null;
            node.disconnect();
        }
        this.source?.disconnect();
        this.gain.disconnect();
        for (const track of this.opened?.getTracks() ?? []) track.stop();
        this.element.pause();
        this.element.srcObject = null;
        if (this.moduleUrl !== null) URL.revokeObjectURL(this.moduleUrl);
        this.moduleUrl = null;
        return this.ownsContext && this.context.state !== "closed" ? this.context.close() : Promise.resolve();
    }

    /** The agent's voice to the output, through a telephone's band when it's asked for. */
    private routeVoice(): void {
        const playback = this.playback;
        if (playback === null || !this.connected) return;
        playback.disconnect();
        if (this.phoneBand === null) {
            playback.connect(this.gain);
            return;
        }
        const [low, high] = this.phoneBand;
        playback.connect(low);
        low.connect(high);
        high.connect(this.gain);
    }

    private bandEdge(type: BiquadFilterType, frequency: number): BiquadFilterNode {
        const edge = this.context.createBiquadFilter();
        edge.type = type;
        edge.frequency.value = frequency;
        return edge;
    }

    /** A sound that won't load is no sound: it's never a reason for a call to fail. */
    private async playAmbience(url: string): Promise<void> {
        try {
            const answer = await fetch(url);
            if (!answer.ok) return;
            const sound = await this.context.decodeAudioData(await answer.arrayBuffer());
            if (this.closed) return;
            const source = this.context.createBufferSource();
            source.buffer = sound;
            source.loop = true;
            source.loopStart = LOOP_TRIM_S;
            source.loopEnd = sound.duration - LOOP_TRIM_S;
            source.connect(this.ambienceGain);
            source.start(0, LOOP_TRIM_S);
            this.ambience = source;
        } catch {
            this.ambienceUrl = null;
        }
    }

    private async openMicrophone(): Promise<MediaStream> {
        const devices = (globalThis.navigator as Navigator | undefined)?.mediaDevices;
        if (devices === undefined) throw new MicrophoneError(new TypeError("The microphone needs a secure page: https, or localhost."));
        try {
            this.opened = await devices.getUserMedia({audio: MICROPHONE});
        } catch (error) {
            // Refused, missing, held by another app, or a device error: whatever it is, it's the microphone's.
            throw new MicrophoneError(error);
        }
        return this.opened;
    }

    /** The worklet module, from the package's own source: an app has nothing to host or configure. */
    private module(): string {
        this.moduleUrl ??= URL.createObjectURL(new Blob([workletSource()], {type: "text/javascript"}));
        return this.moduleUrl;
    }

    /** The playback worklet's report: what plays, how far each reply got, and which played out. */
    private heard({playing, played, ended, level}: PlaybackMessage): void {
        for (const [eventId, ms] of Object.entries(played)) this.played.set(Number(eventId), ms);
        this.current = playing;
        this.loudness = level;
        for (const eventId of ended) this.onPlaybackEnd?.(eventId);
        if (playing === null) this.drained?.();
    }
}
