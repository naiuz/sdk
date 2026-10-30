import {Conversation} from "../src/index";
import type {Callbacks, SessionOptions, WebSocketFactory, WebSocketLike} from "../src/index";

/** A socket the test drives: it records what the client sends, and plays what a server would. */
export class FakeSocket implements WebSocketLike {
    readyState = 0;
    binaryType = "blob";
    /** What the socket holds unsent, as a browser's does after a stall: the test sets it. */
    bufferedAmount = 0;
    readonly sent: string[] = [];
    /** The binary frames the client sent: a call's microphone audio. */
    readonly binary: Uint8Array[] = [];
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: {data: unknown}) => void) | null = null;
    onclose: ((event: {code: number; reason: string}) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    constructor(readonly url: string) {}

    send(data: string | Uint8Array): void {
        if (typeof data === "string") {
            this.sent.push(data);
        } else {
            this.binary.push(data);
        }
    }

    /** Holds the client's close in CLOSING, as a browser does until the server answers it, or a lost network never does. */
    holdClose = false;
    private held: {code: number; reason: string} | null = null;

    close(code = 1000, reason = ""): void {
        if (this.readyState >= 2) return;
        if (this.holdClose) {
            this.readyState = 2;
            this.held = {code, reason};
            return;
        }
        this.readyState = 3;
        this.onclose?.({code, reason});
    }

    /** The held close completes. */
    completeClose(): void {
        const held = this.held ?? {code: 1006, reason: ""};
        this.held = null;
        this.readyState = 3;
        this.onclose?.(held);
    }

    open(): void {
        this.readyState = 1;
        this.onopen?.({});
    }

    serverSends(event: object): void {
        this.onmessage?.({data: JSON.stringify(event)});
    }

    /** A binary frame from the server, as a socket with binaryType "arraybuffer" delivers it. */
    serverSendsBinary(bytes: Uint8Array): void {
        this.onmessage?.({data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
    }

    serverCloses(code: number, reason: string): void {
        this.readyState = 3;
        this.onclose?.({code, reason});
    }

    /** The JSON frames the client sent, leaving out its binary audio. */
    sentJson(): unknown[] {
        return this.sent.map((frame) => JSON.parse(frame) as unknown);
    }

    /** The sequence numbers of the microphone frames the client sent, in order. */
    sequences(): number[] {
        return this.binary.map((frame) => new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(1));
    }
}

/** Every socket a client opens, newest last, through the factory it is given. */
export interface FakeSockets {
    factory: WebSocketFactory;
    all: FakeSocket[];
    /** The newest socket. */
    readonly socket: FakeSocket;
    readonly opened: number;
}

export function fakeSockets(): FakeSockets {
    const all: FakeSocket[] = [];
    const factory = class extends FakeSocket {
        constructor(url: string) {
            super(url);
            all.push(this);
        }
    };
    return {
        factory,
        all,
        get socket() {
            const newest = all.at(-1);
            if (newest === undefined) throw new Error("no socket was opened");
            return newest;
        },
        get opened() {
            return all.length;
        },
    };
}

export const CONVERSATION = "conv_01JB8Z5R4Q6Y2N7K3M9D0F1H3K";

export function metadata(resumeToken = "resume-1"): object {
    return {
        type: "conversation_initiation_metadata",
        conversation_id: CONVERSATION,
        resume_token: resumeToken,
        status: "ai_handling",
        languages: ["uz", "ru", "en"],
        language: "uz",
        features: {text: true, voice: false, debug: false},
    };
}

/** The metadata of a call the server took, playing at the output rate it names. */
export function callMetadata(output: "pcm_16000" | "pcm_24000" = "pcm_24000", resumeToken = "resume-1"): object {
    return {...metadata(resumeToken), features: {text: true, voice: true, debug: false}, audio: {input: "pcm_16000", output}};
}

/** A binary frame of agent audio: kind 0x02, the reply's event id, then silence of the given length. */
export function agentFrame(eventId: number, ms: number, rate = 24_000): Uint8Array {
    const frame = new Uint8Array(5 + (rate / 1000) * ms * 2);
    frame[0] = 0x02;
    new DataView(frame.buffer).setUint32(1, eventId);
    return frame;
}

type Recorded = {[K in keyof Required<Callbacks>]: Parameters<Required<Callbacks>[K]>[]};

/** Callbacks that record each call's arguments. */
export function recorder(): {calls: Recorded; callbacks: Required<Callbacks>} {
    const names = [
        "onConnect", "onDisconnect", "onStatusChange", "onModeChange", "onMessage", "onAgentChatResponsePart",
        "onAgentResponseCorrection", "onAgentTyping", "onHistory", "onHandoff", "onDebug", "onError",
    ] as const;
    const calls = Object.fromEntries(names.map((name) => [name, []])) as unknown as Recorded;
    const callbacks = Object.fromEntries(names.map((name) => [name, (...args: unknown[]) => {
        (calls[name] as unknown[][]).push(args);
    }])) as unknown as Required<Callbacks>;
    return {calls, callbacks};
}

/** A session past its handshake, on a fake socket. */
export async function connected(options: Partial<SessionOptions> = {}) {
    const sockets = fakeSockets();
    const {calls, callbacks} = recorder();
    const started = Conversation.startSession({token: "session-token", WebSocket: sockets.factory, ...callbacks, ...options});
    sockets.socket.open();
    sockets.socket.serverSends(metadata());
    const conversation = await started;
    return {conversation, calls, sockets, socket: sockets.socket, factory: sockets};
}

export function ids(...values: string[]): () => string {
    let next = 0;
    return () => values[next++] ?? `c-${String(next)}`;
}
