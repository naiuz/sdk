import {Conversation} from "../src/index";
import type {Callbacks, SessionOptions, WebSocketFactory, WebSocketLike} from "../src/index";

/** A socket the test drives: it records what the client sends, and plays what a server would. */
export class FakeSocket implements WebSocketLike {
    readyState = 0;
    readonly sent: string[] = [];
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: {data: unknown}) => void) | null = null;
    onclose: ((event: {code: number; reason: string}) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    constructor(readonly url: string) {}

    send(data: string): void {
        this.sent.push(data);
    }

    close(code = 1000, reason = ""): void {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.({code, reason});
    }

    open(): void {
        this.readyState = 1;
        this.onopen?.({});
    }

    serverSends(event: object): void {
        this.onmessage?.({data: JSON.stringify(event)});
    }

    serverCloses(code: number, reason: string): void {
        this.readyState = 3;
        this.onclose?.({code, reason});
    }

    sentJson(): unknown[] {
        return this.sent.map((frame) => JSON.parse(frame) as unknown);
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
