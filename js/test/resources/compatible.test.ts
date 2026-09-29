import {describe, expect, expectTypeOf, it, vi} from "vitest";
import type {APIPromise} from "../../src/core/api-promise";
import {HttpClient} from "../../src/core/http";
import type {WithCost} from "../../src/core/parse";
import {Stream} from "../../src/core/streaming";
import {APIConnectionError, UnprocessableEntityError} from "../../src/errors";
import type {ChatCompletion, ChatCompletionChunk} from "../../src/types/chat";
import {testClient} from "../helpers/client";
import {apiError, json, mockFetch} from "../helpers/mock-fetch";

const completion = {id: "chatcmpl-1", object: "chat.completion", created: 1, model: "m", choices: [], usage: {prompt_tokens: 1, completion_tokens: 1, total_tokens: 2}};
const piece = {id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{index: 0, delta: {content: "Salom"}, finish_reason: null}]};

/** An event stream answer: each entry is one event's data. */
const sse = (events: string[]): Response => new Response(events.map((data) => `data: ${data}\n\n`).join(""), {status: 200, headers: {"content-type": "text/event-stream"}});

describe("the compatible endpoints", () => {
    it("models.list() returns the body as it is, without cost", async () => {
        const {fetch, requests} = mockFetch(json(200, {object: "list", data: [{id: "gemma-4-26b-a4b", object: "model", created: 0, owned_by: "neuronai"}]}));
        const models = await testClient(fetch).models.list();
        expect(models.data[0]?.id).toBe("gemma-4-26b-a4b");
        expect(models.cost).toBeUndefined();
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe("GET /api/v1/models");
    });

    it("embeddings.create() returns the body with cost from X-Cost", async () => {
        const {fetch, requests} = mockFetch(json(200, {object: "list", model: "bge-m3", data: [], usage: {prompt_tokens: 4, total_tokens: 4}}, {"x-cost": "0.02"}));
        const embeddings = await testClient(fetch).embeddings.create({model: "bge-m3", input: ["Salom", "Rahmat"]});
        expect(embeddings.cost).toBe(0.02);
        expect(Object.keys(embeddings)).not.toContain("cost");
        expect(JSON.parse(requests[0]?.body ?? "null")).toStrictEqual({model: "bge-m3", input: ["Salom", "Rahmat"]});
    });

    it("rerank.create() returns the body with cost from X-Cost", async () => {
        const {fetch, requests} = mockFetch(json(200, {id: "r1", model: "bge-reranker-v2-m3", results: [{index: 0, relevance_score: 0.9}], meta: {billed_units: {search_units: 1, input_tokens: 3}}, usage: {prompt_tokens: 3, total_tokens: 3}}, {"x-cost": "0.05"}));
        const ranked = await testClient(fetch).rerank.create({model: "bge-reranker-v2-m3", query: "q", documents: ["d"]});
        expect(ranked.cost).toBe(0.05);
        expect(ranked.results[0]?.relevance_score).toBe(0.9);
        expect(requests[0]?.url.pathname).toBe("/api/v1/rerank");
    });

    it("chat.completions.create() returns the completion with cost from X-Cost", async () => {
        const {fetch, requests} = mockFetch(json(200, completion, {"x-cost": "0.34"}));
        const answer = await testClient(fetch).chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}]});
        expect(answer.id).toBe("chatcmpl-1");
        expect(answer.cost).toBe(0.34);
        expect(requests[0]?.url.pathname).toBe("/api/v1/chat/completions");
    });

    it("chat.completions.create() with stream: true resolves to a Stream of the chunks, asking for an event stream", async () => {
        const {fetch, requests} = mockFetch(sse([JSON.stringify(piece), "[DONE]"]));
        const stream = await testClient(fetch).chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}], stream: true});
        expect(stream).toBeInstanceOf(Stream);
        const chunks: ChatCompletionChunk[] = [];
        for await (const chunk of stream) chunks.push(chunk);
        expect(chunks).toEqual([piece]);
        expect(requests[0]?.headers.get("accept")).toBe("text/event-stream, application/json");
        expect(JSON.parse(requests[0]?.body ?? "null")).toMatchObject({stream: true});
    });

    it("chat.completions.create() retries a stream's enveloped 5xx before it starts, and nothing once it has", async () => {
        let pulls = 0;
        // One chunk, then the connection drops.
        const dropped = new Response(
            new ReadableStream<Uint8Array>({
                pull(controller) {
                    pulls += 1;
                    if (pulls === 1) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(piece)}\n\n`));
                    else controller.error(new TypeError("terminated"));
                },
            }),
            {status: 200, headers: {"content-type": "text/event-stream"}},
        );
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable", {"retry-after": "0"}), dropped);
        const stream = await testClient(fetch, {maxRetries: 2}).chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}], stream: true});
        const chunks: ChatCompletionChunk[] = [];
        const error = await (async () => {
            for await (const chunk of stream) chunks.push(chunk);
        })().catch((caught: unknown) => caught);
        expect(chunks).toEqual([piece]);
        expect(error).toBeInstanceOf(APIConnectionError);
        expect(requests).toHaveLength(2);
    });

    it("chat.completions.create() rejects, never throws, when a JavaScript caller passes no parameters", async () => {
        const {fetch} = mockFetch(apiError(422, "invalid_request"));
        const call = testClient(fetch).chat.completions.create(undefined as never);
        await expect(call).rejects.toBeInstanceOf(UnprocessableEntityError);
    });

    it("types create() by stream: a completion without it, a Stream with stream: true", () => {
        const {completions} = testClient(mockFetch().fetch).chat;
        const messages = [{role: "user", content: "Salom!"}];
        expectTypeOf(() => completions.create({model: "m", messages})).returns.toEqualTypeOf<APIPromise<WithCost<ChatCompletion>>>();
        expectTypeOf(() => completions.create({model: "m", messages, stream: true})).returns.toEqualTypeOf<APIPromise<Stream<ChatCompletionChunk>>>();
    });

    it("retries a paid call after a 5xx, since nothing was charged", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable", {"retry-after": "0"}), json(200, completion));
        await testClient(fetch, {maxRetries: 1}).chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}]});
        expect(requests).toHaveLength(2);
    });

    it("retries models as a safe call, and the paid calls, streamed or not, as paid", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        const client = testClient(mockFetch(json(200, {object: "list", data: []}), json(200, {}), json(200, {}), json(200, completion), sse(["[DONE]"])).fetch);
        await client.models.list();
        await client.embeddings.create({model: "m", input: "x"});
        await client.rerank.create({model: "m", query: "q", documents: ["d"]});
        await client.chat.completions.create({model: "m", messages: [{role: "user", content: "x"}]});
        (await client.chat.completions.create({model: "m", messages: [{role: "user", content: "x"}], stream: true})).close();
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["safe", "paid", "paid", "paid", "paid"]);
    });
});
