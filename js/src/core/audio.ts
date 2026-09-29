import {makeAPIError, NeuronAIError} from "../errors";
import type {DialogueTurnTiming} from "../types/tts";
import type {Attempt} from "./http";
import {numberHeader, readBytes, readText} from "./parse";
import {rootMessage} from "./root-message";

/** The part of node:fs/promises that save() uses, declared here because the published code is checked without Node's types. */
interface FileSystem {
    writeFile(path: string, data: Uint8Array): Promise<void>;
}

// A variable rather than a literal, so a bundler building for the browser leaves the import alone.
const FS_MODULE = "node:fs/promises";

/** Synthesized speech: the WAV file's bytes, and what the answer's headers say about it. */
export class SpeechAudio {
    /** The WAV file's bytes. */
    readonly audio: Uint8Array;
    /** The media type, `audio/wav`. */
    readonly content_type: string;
    /** The price billed, in UZS (`X-Cost`); `null` when the answer lacks the header. */
    readonly cost: number | null;
    /** The characters billed (`X-Character-Count`): an emotion tag counts as one. `null` when the answer lacks the header. */
    readonly character_count: number | null;
    /** Your balance after the charge, in UZS (`X-Balance`); `null` when the answer lacks the header. */
    readonly balance: number | null;
    /** Whether the voice is one of your clones (`X-Voice-Custom: 1`); for a dialogue, whether any turn's is. */
    readonly voice_custom: boolean;
    /** How long the voice took, in milliseconds (`X-Latency-Ms`); `null` when the answer lacks the header. */
    readonly latency_ms: number | null;
    /** Whether this answer replays an earlier request with the same Idempotency-Key (`Idempotency-Replayed: 1`), and so charged nothing new. */
    readonly replayed: boolean;
    /** The request's ID (`X-Request-Id`), to quote to support; `null` when the answer lacks the header. */
    readonly request_id: string | null;

    constructor(audio: Uint8Array, headers: Headers) {
        this.audio = audio;
        this.content_type = headers.get("content-type") ?? "audio/wav";
        this.cost = numberHeader(headers, "x-cost");
        this.character_count = numberHeader(headers, "x-character-count");
        this.balance = numberHeader(headers, "x-balance");
        this.voice_custom = headers.get("x-voice-custom")?.trim() === "1";
        this.latency_ms = numberHeader(headers, "x-latency-ms");
        this.replayed = headers.get("idempotency-replayed")?.trim() === "1";
        this.request_id = headers.get("x-request-id");
    }

    /**
     * Writes the WAV file to `path`, replacing a file already there. It works
     * on Node, Bun and Deno (with `--allow-write`). Elsewhere, such as in a
     * browser, it rejects with NeuronAIError: use the bytes in `audio`.
     */
    async save(path: string): Promise<void> {
        let fs: FileSystem;
        try {
            fs = (await import(/* webpackIgnore: true */ /* @vite-ignore */ FS_MODULE)) as FileSystem;
        } catch (cause) {
            throw new NeuronAIError("save() needs a file system, as on Node, Bun and Deno. Here, use the bytes in audio instead.", {cause});
        }
        try {
            await fs.writeFile(path, this.audio);
        } catch (cause) {
            throw new NeuronAIError(`The audio couldn't be written to ${path}: ${rootMessage(cause)}`, {cause});
        }
    }
}

/** A dialogue's audio: everything SpeechAudio has, and where each turn sits in it. */
export class DialogueAudio extends SpeechAudio {
    /** Where each turn is in the audio (`X-Turns`), so you can seek to a line; empty when the answer lacks the header. */
    readonly turns: DialogueTurnTiming[];
    /** The number of turns rendered (`X-Turn-Count`); `null` when the answer lacks the header. */
    readonly turn_count: number | null;

    constructor(audio: Uint8Array, headers: Headers) {
        super(audio, headers);
        this.turns = turnsOf(headers.get("x-turns"));
        this.turn_count = numberHeader(headers, "x-turn-count");
    }
}

/** The turns an `X-Turns` header lists: a JSON array, or nothing when the header is absent or isn't one. */
function turnsOf(header: string | null): DialogueTurnTiming[] {
    if (header === null) return [];
    try {
        const turns: unknown = JSON.parse(header);
        return Array.isArray(turns) ? (turns as DialogueTurnTiming[]) : [];
    } catch {
        return [];
    }
}

/**
 * An audio answer's bytes. A success that isn't audio, such as a proxy's or
 * a captive portal's HTML page, raises APIError with its status and the
 * start of the body, with the API key redacted from it.
 */
async function readAudio(response: Response, attempt: Attempt): Promise<Uint8Array> {
    if (!/^audio\//i.test(response.headers.get("content-type") ?? "")) {
        throw makeAPIError(response.status, response.statusText, response.headers, attempt.redact(await readText(response)));
    }
    return readBytes(response);
}

/** Reads a speech answer: the WAV and its headers. */
export async function readSpeechAudio(response: Response, attempt: Attempt): Promise<SpeechAudio> {
    return new SpeechAudio(await readAudio(response, attempt), response.headers);
}

/** Reads a dialogue answer: the WAV, its headers, and where each turn sits. */
export async function readDialogueAudio(response: Response, attempt: Attempt): Promise<DialogueAudio> {
    return new DialogueAudio(await readAudio(response, attempt), response.headers);
}
