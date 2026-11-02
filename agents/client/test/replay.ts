import {readFileSync} from "node:fs";
import {vi} from "vitest";
import {Conversation} from "../src/index";
import type {MessageAck, SessionOptions} from "../src/index";
import {fakeSockets, recorder} from "./fake-socket";

export interface RecordedFrame {
    from: "client" | "server";
    frame?: Record<string, unknown>;
    invalid?: true;
    close?: {code: number; reason: string};
    /** A run of binary audio frames: the microphone's, numbered from sequence, or one reply's. */
    audio?: {kind: "user" | "agent"; sequence?: number; event_id?: number; ms: number; count?: number};
}

export interface Recorded {
    description: string;
    token: "session" | "resume";
    frames: RecordedFrame[];
}

export interface ReplayOptions {
    idGenerator?: () => string;
    /** The page's client tools, for a recording that declares some. */
    clientTools?: SessionOptions["clientTools"];
    /** A second recorded connection the client reconnects into after the first closes. */
    then?: Recorded;
}

export function loadFixture(name: string): Recorded {
    return JSON.parse(readFileSync(new URL(`../../../spec/agents/fixtures/${name}.json`, import.meta.url), "utf8")) as Recorded;
}

/** The frames a client sends in a recording, leaving out the ones marked invalid, which a client never sends. */
export function clientFrames(...recorded: Recorded[]): Record<string, unknown>[] {
    return recorded.flatMap((r) => r.frames.filter((f) => f.from === "client" && f.frame !== undefined && f.invalid !== true).map((f) => f.frame ?? {}));
}

/** The texts the client hands to onMessage, in order. */
export function expectedMessages(...recorded: Recorded[]): string[] {
    const types = new Set(["agent_response", "operator_message", "user_message"]);
    return recorded.flatMap((r) => r.frames.filter((f) => f.from === "server" && types.has(String(f.frame?.type))).map((f) => String(f.frame?.text)));
}

export function resumeTokenOf(recorded: Recorded): string {
    const metadata = recorded.frames.find((f) => f.frame?.type === "conversation_initiation_metadata");
    return String(metadata?.frame?.resume_token);
}

/** The session options the recording's first frame asks for. */
function optionsFrom(init: Record<string, unknown> | undefined): Partial<SessionOptions> {
    const options: Partial<SessionOptions> = {};
    if (init?.dynamic_variables !== undefined) options.dynamicVariables = init.dynamic_variables as Record<string, string>;
    if (init?.text_only !== undefined) options.textOnly = init.text_only as boolean;
    if (typeof init?.user_id === "string") options.userId = init.user_id;
    return options;
}

/** Runs timers until the check holds, when the test uses fake timers; otherwise the check must hold already. */
async function until(check: () => boolean, what: string): Promise<void> {
    for (let step = 0; !check(); step++) {
        if (!vi.isFakeTimers() || step > 200) throw new Error(`the client never ${what}`);
        await vi.advanceTimersByTimeAsync(50);
    }
}

/**
 * Plays recorded connections against a client on fake sockets. The test stands in for the app: it calls
 * sendUserMessage for each message the recording sends with a new id. A message with an id already sent is the
 * client's own retry or resend, so the replay waits for it.
 */
export async function replay(first: Recorded, options: ReplayOptions = {}) {
    const sockets = fakeSockets();
    const {calls, callbacks} = recorder();
    const acks: MessageAck[] = [];
    const errors: unknown[] = [];
    const sentIds = new Set<string>();
    const started = Conversation.startSession({
        token: first.token === "session" ? "session-token" : "resume-token-0",
        WebSocket: sockets.factory,
        ...(options.idGenerator === undefined ? {} : {idGenerator: options.idGenerator}),
        ...(options.clientTools === undefined ? {} : {clientTools: options.clientTools}),
        ...optionsFrom(first.frames[0]?.frame),
        ...callbacks,
    });
    started.catch(() => undefined);
    let conversation: Conversation | undefined;
    const recordings = options.then === undefined ? [first] : [first, options.then];
    const sentAll = () => sockets.all.flatMap((socket) => socket.sentJson());
    let clientFramesSoFar = 0;

    for (const [index, recorded] of recordings.entries()) {
        if (index > 0) await until(() => sockets.opened > index, "reconnected");
        sockets.socket.open();
        for (const item of recorded.frames) {
            if (item.close !== undefined) {
                sockets.socket.serverCloses(item.close.code, item.close.reason);
            } else if (item.from === "server") {
                sockets.socket.serverSends(item.frame ?? {});
                if (item.frame?.type === "conversation_initiation_metadata") conversation ??= await started;
            } else if (item.invalid !== true) {
                const frame = item.frame ?? {};
                const expected = ++clientFramesSoFar;
                const id = String(frame.client_message_id);
                if (frame.type === "user_message" && !sentIds.has(id) && conversation !== undefined) {
                    sentIds.add(id);
                    conversation.sendUserMessage(String(frame.text)).then((ack) => acks.push(ack), (error: unknown) => errors.push(error));
                }
                await until(() => sentAll().length >= expected, `sent ${String(frame.type)}`);
            }
        }
    }
    await Promise.resolve();
    return {sent: sentAll(), calls, acks, errors, urls: sockets.all.map((socket) => socket.url), conversation, sockets};
}
