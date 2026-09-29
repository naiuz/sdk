import {describe, expect, it, vi} from "vitest";
import {HttpClient} from "../../src/core/http";
import type {Transcription} from "../../src/types/transcription";
import {testClient} from "../helpers/client";
import {envelope, mockFetch} from "../helpers/mock-fetch";

const CLIP = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
const transcription: Transcription = {text: "Salom dunyo", language: "uz", duration_seconds: 2, segments: [{start: 0, end: 2, text: "Salom dunyo"}], cost: 16.67, balance: 9983.33};

describe("stt", () => {
    it("transcribe() sends the file and the language as multipart, with an Idempotency-Key, and resolves to the transcription", async () => {
        const {fetch, requests} = mockFetch(envelope(transcription, "req-stt"));
        const result = await testClient(fetch).stt.transcribe({file: {data: CLIP, filename: "clip.m4a"}, language: "uz"}, {idempotencyKey: "stt-1"});
        expect(result).toEqual(transcription);
        expect(result.request_id).toBe("req-stt");
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe("POST /api/v1/stt/transcribe");
        expect(requests[0]?.headers.get("idempotency-key")).toBe("stt-1");
        const file = requests[0]?.form?.get("file");
        expect(file).toBeInstanceOf(File);
        expect([(file as File).name, (file as File).type]).toEqual(["clip.m4a", "audio/mp4"]);
        expect(requests[0]?.form?.get("language")).toBe("uz");
    });

    it("transcribe() generates an Idempotency-Key when given none", async () => {
        const {fetch, requests} = mockFetch(envelope(transcription));
        await testClient(fetch).stt.transcribe({file: new File([CLIP], "clip.wav"), language: "uz"});
        expect(requests[0]?.headers.get("idempotency-key")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("retries transcribe as an idempotent call", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        await testClient(mockFetch(envelope(transcription)).fetch).stt.transcribe({file: new File([CLIP], "clip.wav"), language: "uz"});
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["idempotent"]);
    });
});
