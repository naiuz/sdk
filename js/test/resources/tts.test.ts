import {describe, expect, expectTypeOf, it, vi} from "vitest";
import {DialogueAudio, SpeechAudio} from "../../src/core/audio";
import {HttpClient} from "../../src/core/http";
import {GoneError, InsufficientQuotaError, NeuronAIError, WaitTimeoutError} from "../../src/errors";
import type {TtsJob, TtsJobStatus} from "../../src/types/tts";
import {testClient} from "../helpers/client";
import {apiError, envelope, mockFetch} from "../helpers/mock-fetch";

const job = (status: TtsJob["status"]): TtsJob => ({
    id: "job-1",
    status,
    created_at: "2026-09-28T10:00:00Z",
    started_at: null,
    finished_at: null,
    character_count: 5,
    cost: null,
    balance_after: null,
    voice_custom: false,
    latency_ms: null,
    error: null,
    audio_url: null,
});

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

/** An audio answer with synthesize's headers, and any others given. */
const wav = (headers: Record<string, string> = {}): Response =>
    new Response(WAV, {status: 200, headers: {"content-type": "audio/wav", "x-cost": "12.5", "x-character-count": "5", "x-request-id": "req-audio", ...headers}});

describe("tts", () => {
    it("synthesize() posts the text with an Idempotency-Key, asks for audio, and resolves to the WAV and its headers", async () => {
        const {fetch, requests} = mockFetch(wav());
        const audio = await testClient(fetch).tts.synthesize({text: "Salom", voice_id: "uz-sardor"}, {idempotencyKey: "order-42"});
        expect(audio).toBeInstanceOf(SpeechAudio);
        expect(audio.audio).toEqual(WAV);
        expect([audio.cost, audio.character_count, audio.request_id]).toEqual([12.5, 5, "req-audio"]);
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe("POST /api/v1/tts/synthesize");
        expect(requests[0]?.headers.get("idempotency-key")).toBe("order-42");
        expect(requests[0]?.headers.get("accept")).toBe("audio/wav, application/json");
        expect(JSON.parse(requests[0]?.body ?? "null")).toStrictEqual({text: "Salom", voice_id: "uz-sardor"});
    });

    it("dialogue() posts the script and resolves to the WAV, with where each turn sits", async () => {
        const turns = [{index: 0, voice_id: "uz-sardor", start_s: 0, end_s: 0.8, duration_s: 0.8}];
        const {fetch, requests} = mockFetch(wav({"x-turns": JSON.stringify(turns), "x-turn-count": "1"}));
        const script = {turns: [{voice_id: "uz-sardor", text: "Salom!"}], gap_ms: 300};
        const audio = await testClient(fetch).tts.dialogue(script);
        expect(audio).toBeInstanceOf(DialogueAudio);
        expect(audio.turns).toEqual(turns);
        expect(audio.turn_count).toBe(1);
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe("POST /api/v1/tts/dialogue");
        expect(requests[0]?.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
        expect(JSON.parse(requests[0]?.body ?? "null")).toStrictEqual(script);
    });

    it("raises the API's error answer, such as a 402 for a low balance", async () => {
        const {fetch} = mockFetch(apiError(402, "insufficient_balance"));
        await expect(testClient(fetch).tts.synthesize({text: "Salom"})).rejects.toBeInstanceOf(InsufficientQuotaError);
    });

    it("retries synthesize and dialogue as idempotent calls", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        const client = testClient(mockFetch(wav(), wav()).fetch);
        await client.tts.synthesize({text: "Salom"});
        await client.tts.dialogue({turns: [{voice_id: "uz-sardor", text: "Salom!"}]});
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["idempotent", "idempotent"]);
    });
});

describe("tts.jobs", () => {
    it("create() sends the caller's Idempotency-Key and resolves to the queued job", async () => {
        const {fetch, requests} = mockFetch(envelope(job("queued"), "req-job", 202));
        const created = await testClient(fetch).tts.jobs.create({text: "Salom", voice_id: "uz-sardor"}, {idempotencyKey: "order-42"});
        expect(created.status).toBe("queued");
        expect(created.request_id).toBe("req-job");
        expect(requests[0]?.method).toBe("POST");
        expect(requests[0]?.url.pathname).toBe("/api/v1/tts/jobs");
        expect(requests[0]?.headers.get("idempotency-key")).toBe("order-42");
        expect(JSON.parse(requests[0]?.body ?? "null")).toStrictEqual({text: "Salom", voice_id: "uz-sardor"});
    });

    it("create() generates an Idempotency-Key when given none", async () => {
        const {fetch, requests} = mockFetch(envelope(job("queued"), "req-job", 202));
        await testClient(fetch).tts.jobs.create({text: "Salom"});
        expect(requests[0]?.headers.get("idempotency-key")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("create() resolves to the job for a 200 replay as for a 202", async () => {
        const {fetch} = mockFetch(new Response(JSON.stringify({data: job("succeeded"), request_id: "req-replay"}), {status: 200, headers: {"content-type": "application/json", "idempotency-replayed": "1"}}));
        const {data, status, headers} = await testClient(fetch).tts.jobs.create({text: "Salom"}, {idempotencyKey: "order-42"}).withResponse();
        expect(data.status).toBe("succeeded");
        expect(status).toBe(200);
        expect(headers.get("idempotency-replayed")).toBe("1");
    });

    it("retrieve() reads the job by id", async () => {
        const {fetch, requests} = mockFetch(envelope(job("running")));
        await expect(testClient(fetch).tts.jobs.retrieve("job-1")).resolves.toMatchObject({status: "running"});
        expect(requests[0]?.url.pathname).toBe("/api/v1/tts/jobs/job-1");
    });

    it("retries create as idempotent and retrieve as safe", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        const client = testClient(mockFetch(envelope(job("queued")), envelope(job("queued"))).fetch);
        await client.tts.jobs.create({text: "Salom"});
        await client.tts.jobs.retrieve("job-1");
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["idempotent", "safe"]);
    });

    it("audio() reads a finished job's WAV, asking for audio", async () => {
        const {fetch, requests} = mockFetch(wav());
        const audio = await testClient(fetch).tts.jobs.audio("job-1");
        expect(audio.audio).toEqual(WAV);
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe("GET /api/v1/tts/jobs/job-1/audio");
        expect(requests[0]?.headers.get("accept")).toBe("audio/wav, application/json");
    });

    it("audio() raises GoneError once the audio is past its 24 hours", async () => {
        const {fetch} = mockFetch(apiError(410, "audio_expired"));
        const error = await testClient(fetch).tts.jobs.audio("job-1").catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(GoneError);
        expect(error).toMatchObject({status: 410, code: "audio_expired"});
    });

    it("retries audio() as a safe call", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        await testClient(mockFetch(wav()).fetch).tts.jobs.audio("job-1");
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["safe"]);
    });

    it("types a job's status as an open union", () => {
        expectTypeOf<TtsJobStatus>().toEqualTypeOf<"queued" | "running" | "succeeded" | "failed" | (string & {})>();
    });
});

describe("WaitTimeoutError", () => {
    it("is a NeuronAIError that carries the last job seen", () => {
        const last = job("running");
        const error = new WaitTimeoutError(last);
        expect(error).toBeInstanceOf(NeuronAIError);
        expect(error.name).toBe("WaitTimeoutError");
        expect(error.job).toBe(last);
        expect(error.message).toBe("The job job-1 was still running when the wait ran out.");
    });
});
