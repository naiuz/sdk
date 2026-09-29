import {getEventListeners} from "node:events";
import {afterEach, describe, expect, expectTypeOf, it, vi} from "vitest";
import {DialogueAudio, SpeechAudio} from "../../src/core/audio";
import {HttpClient} from "../../src/core/http";
import {AuthenticationError, GoneError, InsufficientQuotaError, NeuronAIError, WaitTimeoutError} from "../../src/errors";
import type {TtsJob, TtsJobStatus} from "../../src/types/tts";
import {testClient} from "../helpers/client";
import {apiError, envelope, hang, mockFetch, refused} from "../helpers/mock-fetch";

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

describe("tts.jobs.createAndWait", () => {
    const queued = (): Response => envelope(job("queued"), "req-create", 202);
    const polled = (status: TtsJob["status"]): Response => envelope(job(status), `req-${status}`);

    afterEach(() => {
        vi.useRealTimers();
    });

    it("creates the job, polls it every 2 s until it succeeds, and resolves to it", async () => {
        vi.useFakeTimers();
        const {fetch, requests} = mockFetch(queued(), polled("running"), polled("succeeded"));
        const wait = testClient(fetch).tts.jobs.createAndWait({text: "Salom"});
        await vi.advanceTimersByTimeAsync(1999);
        expect(requests).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(requests).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(2000);
        const done = await wait;
        expect(done.status).toBe("succeeded");
        expect(done.request_id).toBe("req-succeeded");
        expect(requests.map((request) => `${request.method} ${request.url.pathname}`)).toEqual(["POST /api/v1/tts/jobs", "GET /api/v1/tts/jobs/job-1", "GET /api/v1/tts/jobs/job-1"]);
    });

    it("resolves to a job that failed as well", async () => {
        vi.useFakeTimers();
        const {fetch} = mockFetch(queued(), polled("failed"));
        const wait = testClient(fetch).tts.jobs.createAndWait({text: "Salom"});
        await vi.advanceTimersByTimeAsync(2000);
        await expect(wait).resolves.toMatchObject({status: "failed"});
    });

    it("resolves at once to a job that is already final, polling nothing", async () => {
        const {fetch, requests} = mockFetch(envelope(job("succeeded"), "req-replay"));
        await expect(testClient(fetch).tts.jobs.createAndWait({text: "Salom"})).resolves.toMatchObject({status: "succeeded"});
        expect(requests).toHaveLength(1);
    });

    it("rejects with WaitTimeoutError, carrying the job as last seen, when its time runs out", async () => {
        vi.useFakeTimers();
        const {fetch, requests} = mockFetch(queued(), polled("running"), polled("running"));
        const caught = testClient(fetch).tts.jobs.createAndWait({text: "Salom"}, {timeout: 5000}).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(5000);
        const error = await caught;
        expect(error).toBeInstanceOf(WaitTimeoutError);
        expect((error as WaitTimeoutError).job.status).toBe("running");
        expect(requests).toHaveLength(3);
    });

    it("abandons a poll still in flight when its time runs out", async () => {
        vi.useFakeTimers();
        const {fetch, requests} = mockFetch(queued(), hang);
        const caught = testClient(fetch).tts.jobs.createAndWait({text: "Salom"}, {timeout: 5000}).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(5000);
        const error = await caught;
        expect(error).toBeInstanceOf(WaitTimeoutError);
        expect((error as WaitTimeoutError).job.status).toBe("queued");
        expect(requests[1]?.signal?.aborted).toBe(true);
    });

    it("stops at once when the caller's signal aborts, between polls or during one", async () => {
        vi.useFakeTimers();
        const reason = new Error("The caller gave up.");
        const between = new AbortController();
        const first = mockFetch(queued());
        const waiting = testClient(first.fetch).tts.jobs.createAndWait({text: "Salom"}, {signal: between.signal}).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(1000);
        between.abort(reason);
        await expect(waiting).resolves.toBe(reason);
        expect(first.requests).toHaveLength(1);

        const during = new AbortController();
        const second = mockFetch(queued(), hang);
        const polling = testClient(second.fetch).tts.jobs.createAndWait({text: "Salom"}, {signal: during.signal}).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(3000);
        during.abort(reason);
        await expect(polling).resolves.toBe(reason);
        expect(second.requests).toHaveLength(2);
    });

    it("sends the caller's Idempotency-Key with the create, and its other options with every request", async () => {
        vi.useFakeTimers();
        const {fetch, requests} = mockFetch(queued(), polled("succeeded"));
        const wait = testClient(fetch).tts.jobs.createAndWait({text: "Salom"}, {idempotencyKey: "order-42", extraHeaders: {"x-trace": "t1"}, pollInterval: 500});
        await vi.advanceTimersByTimeAsync(500);
        await wait;
        expect(requests.map((request) => request.headers.get("idempotency-key"))).toEqual(["order-42", null]);
        expect(requests.map((request) => request.headers.get("x-trace"))).toEqual(["t1", "t1"]);
    });

    it("refuses an invalid pollInterval or timeout without sending anything", async () => {
        const {fetch, requests} = mockFetch();
        const {jobs} = testClient(fetch).tts;
        await expect(jobs.createAndWait({text: "Salom"}, {pollInterval: 0})).rejects.toThrow("pollInterval must be a number of milliseconds from 1 to 2147483647.");
        await expect(jobs.createAndWait({text: "Salom"}, {timeout: Number.NaN})).rejects.toThrow("timeout must be a number of milliseconds from 1 to 2147483647.");
        expect(requests).toHaveLength(0);
    });

    it("keeps polling through a burst of passing failures, then resolves once the job succeeds", async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const {fetch, requests} = mockFetch(queued(), apiError(502, "bad_gateway"), refused(), apiError(429, "rate_limited", {"retry-after": "5"}), polled("succeeded"));
        const wait = testClient(fetch).tts.jobs.createAndWait({text: "Salom"}, {signal: controller.signal});
        await vi.advanceTimersByTimeAsync(2000);
        expect(requests).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(2000);
        expect(requests).toHaveLength(3);
        await vi.advanceTimersByTimeAsync(2000);
        expect(requests).toHaveLength(4);
        // The 429's Retry-After is 5 s: the next poll must not arrive at the plain 2 s pollInterval.
        await vi.advanceTimersByTimeAsync(2000);
        expect(requests).toHaveLength(4);
        await vi.advanceTimersByTimeAsync(3000);
        expect(requests).toHaveLength(5);
        const done = await wait;
        expect(done.status).toBe("succeeded");
        expect(vi.getTimerCount()).toBe(0);
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });

    it("ends the wait at once on an error it can't outlast, such as a 401", async () => {
        vi.useFakeTimers();
        const {fetch, requests} = mockFetch(queued(), apiError(401, "invalid_api_key"));
        const caught = testClient(fetch).tts.jobs.createAndWait({text: "Salom"}).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(2000);
        const error = await caught;
        expect(error).toBeInstanceOf(AuthenticationError);
        expect(requests).toHaveLength(2);
    });

    it("ends the wait with WaitTimeoutError when passing failures run past the deadline", async () => {
        vi.useFakeTimers();
        const {fetch, requests} = mockFetch(queued(), apiError(503, "unavailable"), apiError(503, "unavailable"));
        const caught = testClient(fetch).tts.jobs.createAndWait({text: "Salom"}, {timeout: 5000}).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(5000);
        const error = await caught;
        expect(error).toBeInstanceOf(WaitTimeoutError);
        expect((error as WaitTimeoutError).job).toMatchObject({status: "queued", id: "job-1"});
        expect(requests).toHaveLength(3);
    });

    it("rejects with the caller's reason when they abort while a poll is failing", async () => {
        vi.useFakeTimers();
        const reason = new Error("The caller gave up.");
        const controller = new AbortController();
        const {fetch, requests} = mockFetch(queued(), apiError(502, "bad_gateway"), hang);
        const waiting = testClient(fetch).tts.jobs.createAndWait({text: "Salom"}, {signal: controller.signal}).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(4000);
        expect(requests).toHaveLength(3);
        controller.abort(reason);
        await expect(waiting).resolves.toBe(reason);
        expect(requests).toHaveLength(3);
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
