import {describe, expect, expectTypeOf, it, vi} from "vitest";
import {HttpClient} from "../../src/core/http";
import {NeuronAIError, WaitTimeoutError} from "../../src/errors";
import type {TtsJob, TtsJobStatus} from "../../src/types/tts";
import {testClient} from "../helpers/client";
import {envelope, mockFetch} from "../helpers/mock-fetch";

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
