import {beforeAll, describe, expect, it} from "vitest";
import {NeuronAI} from "../src/client";
import type {ChatCompletionChunk} from "../src/types/chat";

// A restricted key of a test organization with a small balance. Without it, every test here is skipped.
const apiKey = process.env.NEURONAI_SMOKE_API_KEY?.trim() ?? "";

/** Whether the bytes start as a WAV file does: "RIFF". */
const isWav = (bytes: Uint8Array): boolean => new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF";

describe.skipIf(apiKey === "")("the live API", () => {
    let client: NeuronAI;
    // Filled in by the tests before the ones that use them, which run in order.
    let voiceId = "";
    let speech: Uint8Array = new Uint8Array();

    beforeAll(() => {
        client = new NeuronAI({apiKey});
    });

    it("reads the balance", async () => {
        const balance = await client.account.balance();
        expect(typeof balance.balance).toBe("number");
        expect(balance.currency).not.toBe("");
    });

    it("lists voices", async () => {
        const page = await client.voices.list({type: "stock", language: "uz", limit: 5});
        expect(page.data.length).toBeGreaterThan(0);
        voiceId = page.data[0]?.id ?? "";
    });

    it("synthesizes a short line", async () => {
        expect(voiceId, "the voice list gave a voice").not.toBe("");
        const audio = await client.tts.synthesize({text: "Assalomu alaykum! Bu sinov.", voice_id: voiceId, language: "uz"});
        expect(isWav(audio.audio)).toBe(true);
        expect(audio.content_type).toBe("audio/wav");
        expect(typeof audio.cost).toBe("number");
        expect(audio.request_id).not.toBeNull();
        speech = audio.audio;
    });

    it("transcribes a clip: the synthesized line", async () => {
        expect(speech.length, "the synthesis gave audio").toBeGreaterThan(0);
        const transcription = await client.stt.transcribe({file: {data: speech, filename: "smoke.wav"}, language: "uz"});
        expect(typeof transcription.text).toBe("string");
        expect(transcription.duration_seconds).toBeGreaterThan(0);
    });

    it("waits for a synthesis job, and downloads its audio", async () => {
        const job = await client.tts.jobs.createAndWait({text: "Salom!", voice_id: voiceId, language: "uz"}, {pollInterval: 1000, timeout: 120_000});
        expect(job.status).toBe("succeeded");
        expect(isWav((await client.tts.jobs.audio(job.id)).audio)).toBe(true);
    });

    it("streams a chat completion", async () => {
        const models = await client.models.list();
        const model = models.data[0]?.id ?? "";
        expect(model, "the model list gave a model").not.toBe("");
        const stream = await client.chat.completions.create({model, messages: [{role: "user", content: "Salom! Bir so'z bilan javob ber."}], max_tokens: 16, stream: true});
        const chunks: ChatCompletionChunk[] = [];
        for await (const chunk of stream) chunks.push(chunk);
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.map((chunk) => chunk.choices[0]?.delta.content ?? "").join("")).not.toBe("");
    });
});
