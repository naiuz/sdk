import {describe, expect, expectTypeOf, it, vi} from "vitest";
import {HttpClient} from "../../src/core/http";
import {NeuronAIError, NotFoundError} from "../../src/errors";
import type {Voice, VoiceCategory, VoiceType} from "../../src/types/voices";
import {testClient} from "../helpers/client";
import {apiError, envelope, json, mockFetch} from "../helpers/mock-fetch";

const voice = (id: string): Voice => ({id, name: id, language: "uz", tags: [], type: "custom", category: null, ref_text: null, created_at: null});
const page = (ids: string[], nextCursor: string | null): Response => json(200, {data: ids.map(voice), next_cursor: nextCursor, request_id: "req-page"});
const CLIP = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

/** A sent form's parts, in order: each text field as it is, and each file as its filename, content type and bytes. */
async function partsOf(form: FormData | null | undefined): Promise<unknown[]> {
    if (!form) throw new Error("No form was sent.");
    const parts: unknown[] = [];
    for (const [name, value] of form.entries()) {
        parts.push(typeof value === "string" ? [name, value] : [name, {filename: value.name, type: value.type, bytes: [...new Uint8Array(await value.arrayBuffer())]}]);
    }
    return parts;
}

describe("voices", () => {
    it("list() sends no query when given none, and the query it is given", async () => {
        const {fetch, requests} = mockFetch(page(["a"], null), page(["b"], null));
        const client = testClient(fetch);
        await client.voices.list();
        await client.voices.list({type: "stock", language: "uz", limit: 100, cursor: "c1"});
        expect(requests[0]?.url.search).toBe("");
        expect(Object.fromEntries(requests[1]?.url.searchParams ?? [])).toEqual({type: "stock", language: "uz", limit: "100", cursor: "c1"});
    });

    it("walks every voice across pages with for await", async () => {
        const {fetch} = mockFetch(page(["a", "b"], "c2"), page(["c"], null));
        const ids: string[] = [];
        for await (const item of testClient(fetch).voices.list({limit: 2})) ids.push(item.id);
        expect(ids).toEqual(["a", "b", "c"]);
    });

    it("sends a limit outside 1-100 as given, and raises the API's 422", async () => {
        const {fetch, requests} = mockFetch(apiError(422, "invalid_request"));
        await expect(testClient(fetch).voices.list({limit: 0})).rejects.toMatchObject({status: 422, code: "invalid_request"});
        expect(requests[0]?.url.searchParams.get("limit")).toBe("0");
    });

    it("retrieve() reads one voice, with its request_id", async () => {
        const {fetch, requests} = mockFetch(envelope(voice("uz-sardor"), "req-voice"));
        const found = await testClient(fetch).voices.retrieve("uz-sardor");
        expect(found.id).toBe("uz-sardor");
        expect(found.request_id).toBe("req-voice");
        expect(requests[0]?.url.pathname).toBe("/api/v1/tts/voices/uz-sardor");
    });

    it("retrieve() refuses an empty or dot-segment id without sending anything", async () => {
        const {fetch, requests} = mockFetch();
        const client = testClient(fetch);
        for (const id of ["", ".", ".."]) await expect(client.voices.retrieve(id)).rejects.toBeInstanceOf(NeuronAIError);
        expect(requests).toHaveLength(0);
    });

    it("create() sends the clip and its fields as multipart, the tags as repeated tags[], with an Idempotency-Key", async () => {
        const {fetch, requests} = mockFetch(envelope(voice("v1"), "req-clone", 201));
        const created = await testClient(fetch).voices.create(
            {name: "Office voice", language: "uz", ref_audio: {data: CLIP, filename: "sample.wav"}, ref_text: "Salom", category: "conversational", tags: ["support", "calm"]},
            {idempotencyKey: "clone-1"},
        );
        expect(created.id).toBe("v1");
        expect(created.request_id).toBe("req-clone");
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe("POST /api/v1/tts/voices");
        expect(requests[0]?.headers.get("idempotency-key")).toBe("clone-1");
        expect(requests[0]?.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
        expect(await partsOf(requests[0]?.form)).toEqual([
            ["name", "Office voice"],
            ["language", "uz"],
            ["ref_audio", {filename: "sample.wav", type: "audio/wav", bytes: [...CLIP]}],
            ["ref_text", "Salom"],
            ["category", "conversational"],
            ["tags[]", "support"],
            ["tags[]", "calm"],
        ]);
    });

    it("create() resolves to the voice for a 200 replay of its key, as for a 201", async () => {
        const {fetch} = mockFetch(envelope(voice("v1"), "req-replay", 200));
        const {data, status} = await testClient(fetch).voices.create({name: "Office voice", language: "uz", ref_audio: new File([CLIP], "sample.wav")}, {idempotencyKey: "clone-1"}).withResponse();
        expect(data.id).toBe("v1");
        expect(status).toBe(200);
    });

    it("create() refuses a path in place of the clip, sending nothing", async () => {
        const {fetch, requests} = mockFetch();
        const call = testClient(fetch).voices.create({name: "Office voice", language: "uz", ref_audio: "sample.wav" as never});
        await expect(call).rejects.toThrow("ref_audio must be a File, or {data, filename} with the bytes as a Uint8Array or a Blob.");
        expect(requests).toHaveLength(0);
    });

    it("replaceAudio() sends the new clip and its transcript as multipart, with no Idempotency-Key", async () => {
        const {fetch, requests} = mockFetch(envelope(voice("v1")));
        await testClient(fetch).voices.replaceAudio("v1", {ref_audio: {data: CLIP, filename: "new.mp3"}, ref_text: "Yangi"});
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe("POST /api/v1/tts/voices/v1/audio");
        expect(requests[0]?.headers.has("idempotency-key")).toBe(false);
        expect(await partsOf(requests[0]?.form)).toEqual([
            ["ref_audio", {filename: "new.mp3", type: "audio/mpeg", bytes: [...CLIP]}],
            ["ref_text", "Yangi"],
        ]);
    });

    it("update() sends only the given fields, nulls included", async () => {
        const {fetch, requests} = mockFetch(envelope(voice("v1")));
        await testClient(fetch).voices.update("v1", {name: "Support voice", tags: null});
        expect(requests[0]?.method).toBe("PATCH");
        expect(JSON.parse(requests[0]?.body ?? "null")).toStrictEqual({name: "Support voice", tags: null});
    });

    it("delete() resolves to undefined on a 204", async () => {
        const {fetch, requests} = mockFetch(new Response(null, {status: 204, headers: {"x-request-id": "req-delete"}}));
        await expect(testClient(fetch).voices.delete("v1")).resolves.toBeUndefined();
        expect(requests[0]?.method).toBe("DELETE");
        expect(requests[0]?.body).toBeNull();
    });

    it("raises the API's 404 as NotFoundError", async () => {
        const {fetch} = mockFetch(apiError(404, "not_found"));
        await expect(testClient(fetch).voices.retrieve("no-such-voice")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("retries list, retrieve and delete as safe calls, create as idempotent, and update and replaceAudio as re-creates", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        const client = testClient(mockFetch(page([], null), envelope(voice("v1")), envelope(voice("v1")), envelope(voice("v1")), envelope(voice("v1")), new Response(null, {status: 204})).fetch);
        await client.voices.list();
        await client.voices.retrieve("v1");
        await client.voices.create({name: "V", language: "uz", ref_audio: new File([CLIP], "a.wav")});
        await client.voices.update("v1", {name: "x"});
        await client.voices.replaceAudio("v1", {ref_audio: new File([CLIP], "a.wav")});
        await client.voices.delete("v1");
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["safe", "safe", "idempotent", "recreate", "recreate", "safe"]);
    });

    it("types its enums as open unions, so a value the API adds later still type-checks", () => {
        expectTypeOf<VoiceType>().toEqualTypeOf<"custom" | "stock" | (string & {})>();
        const later: VoiceCategory = "audiobooks";
        expect(later).toBe("audiobooks");
    });

    it("a voice may leave out category, ref_text and created_at, as the API document allows", () => {
        const voice: Voice = {id: "v", name: "V", language: "uz", tags: [], type: "stock"};
        expect(voice.id).toBe("v");
    });
});
