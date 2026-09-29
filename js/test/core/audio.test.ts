import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {DialogueAudio, readDialogueAudio, readSpeechAudio, SpeechAudio} from "../../src/core/audio";
import {APIConnectionError, APIError, NeuronAIError} from "../../src/errors";
import {KEY, testAttempt} from "../helpers/http";

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]);

/** A speech answer with synthesize's headers, and any others given. */
const speech = (headers: Record<string, string> = {}): Response =>
    new Response(WAV, {
        status: 200,
        headers: {"content-type": "audio/wav", "x-cost": "12.5", "x-balance": "9987.5", "x-character-count": "5", "x-voice-custom": "0", "x-latency-ms": "820.5", "x-request-id": "req-1", ...headers},
    });

const fields = (audio: SpeechAudio) => ({
    content_type: audio.content_type,
    cost: audio.cost,
    character_count: audio.character_count,
    balance: audio.balance,
    voice_custom: audio.voice_custom,
    latency_ms: audio.latency_ms,
    replayed: audio.replayed,
    request_id: audio.request_id,
});

afterEach(() => {
    vi.doUnmock("node:fs/promises");
});

describe("readSpeechAudio", () => {
    it("reads the WAV's bytes, and turns its headers into typed fields", async () => {
        const audio = await readSpeechAudio(speech(), testAttempt());
        expect(audio).toBeInstanceOf(SpeechAudio);
        expect(audio.audio).toEqual(WAV);
        expect(fields(audio)).toEqual({content_type: "audio/wav", cost: 12.5, character_count: 5, balance: 9987.5, voice_custom: false, latency_ms: 820.5, replayed: false, request_id: "req-1"});
    });

    it("reads X-Voice-Custom and Idempotency-Replayed as true only for 1", async () => {
        const ones = await readSpeechAudio(speech({"x-voice-custom": "1", "idempotency-replayed": "1"}), testAttempt());
        const words = await readSpeechAudio(speech({"x-voice-custom": "true", "idempotency-replayed": "yes"}), testAttempt());
        expect([ones.voice_custom, ones.replayed]).toEqual([true, true]);
        expect([words.voice_custom, words.replayed]).toEqual([false, false]);
    });

    it("gives null for a number header that is missing or unreadable, and false for a missing flag", async () => {
        const bare = await readSpeechAudio(new Response(WAV, {headers: {"content-type": "audio/wav", "x-latency-ms": "n/a"}}), testAttempt());
        expect(fields(bare)).toEqual({content_type: "audio/wav", cost: null, character_count: null, balance: null, voice_custom: false, latency_ms: null, replayed: false, request_id: null});
    });

    it("raises APIError for a success that isn't audio, such as a portal's page, with the API key redacted", async () => {
        const page = new Response(`<html>Sign in first. Authorization: Bearer ${KEY}</html>`, {status: 200, statusText: "OK", headers: {"content-type": "text/html"}});
        const error = await readSpeechAudio(page, testAttempt()).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APIError);
        expect(error).toMatchObject({status: 200, code: null, message: "OK: <html>Sign in first. Authorization: Bearer [redacted]</html>"});
    });

    it("raises APIConnectionError, saying what failed, when the connection drops mid-audio", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(WAV.slice(0, 4));
                controller.error(new TypeError("terminated", {cause: new Error("other side closed")}));
            },
        });
        const error = await readSpeechAudio(new Response(body, {headers: {"content-type": "audio/wav"}}), testAttempt()).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APIConnectionError);
        expect((error as Error).message).toBe("The connection failed while the response arrived: other side closed");
    });
});

describe("readDialogueAudio", () => {
    it("adds where each turn sits in the audio, and the turn count", async () => {
        const turns = [
            {index: 0, voice_id: "uz-sardor", start_s: 0, end_s: 0.8, duration_s: 0.8},
            {index: 1, voice_id: "uz-malika", start_s: 1.1, end_s: 2.4, duration_s: 1.3},
        ];
        const audio = await readDialogueAudio(speech({"x-turns": JSON.stringify(turns), "x-turn-count": "2"}), testAttempt());
        expect(audio).toBeInstanceOf(DialogueAudio);
        expect(audio).toBeInstanceOf(SpeechAudio);
        expect(audio.turns).toEqual(turns);
        expect(audio.turn_count).toBe(2);
        expect(audio.cost).toBe(12.5);
    });

    it("gives no turns when X-Turns is missing or isn't a JSON list", async () => {
        for (const headers of [{}, {"x-turns": "not json"}, {"x-turns": '{"index":0}'}] as Record<string, string>[]) {
            expect((await readDialogueAudio(speech(headers), testAttempt())).turns).toEqual([]);
        }
    });
});

describe("save()", () => {
    it("writes the WAV's bytes to the path", async () => {
        const directory = await mkdtemp(join(tmpdir(), "naiuz-audio-"));
        try {
            const path = join(directory, "speech.wav");
            await (await readSpeechAudio(speech(), testAttempt())).save(path);
            expect(new Uint8Array(await readFile(path))).toEqual(WAV);
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    it("rejects with NeuronAIError, saying why, when the file can't be written", async () => {
        const directory = await mkdtemp(join(tmpdir(), "naiuz-audio-"));
        try {
            const audio = await readSpeechAudio(speech(), testAttempt());
            const error = await audio.save(join(directory, "missing", "speech.wav")).catch((caught: unknown) => caught);
            expect(error).toBeInstanceOf(NeuronAIError);
            expect((error as Error).message).toMatch(/^The audio couldn't be written to .*speech\.wav: ENOENT/);
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    it("rejects with NeuronAIError where there is no file system, as in a browser", async () => {
        vi.doMock("node:fs/promises", () => {
            throw new Error("No such module here.");
        });
        const audio = await readSpeechAudio(speech(), testAttempt());
        await expect(audio.save("speech.wav")).rejects.toThrow("save() needs a file system, as on Node, Bun and Deno. Here, use the bytes in audio instead.");
    });
});
