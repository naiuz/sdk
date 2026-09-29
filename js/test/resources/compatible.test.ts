import {describe, expect, it, vi} from "vitest";
import {HttpClient} from "../../src/core/http";
import {NeuronAIError} from "../../src/errors";
import {testClient} from "../helpers/client";
import {apiError, json, mockFetch} from "../helpers/mock-fetch";

const completion = {id: "chatcmpl-1", object: "chat.completion", created: 1, model: "m", choices: [], usage: {prompt_tokens: 1, completion_tokens: 1, total_tokens: 2}};

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

    it("chat.completions.create() with stream: true rejects with NeuronAIError and sends nothing", async () => {
        const {fetch, requests} = mockFetch();
        const call = testClient(fetch).chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}], stream: true});
        await expect(call).rejects.toBeInstanceOf(NeuronAIError);
        await expect(call).rejects.toThrow("stream: true is not supported yet: streaming arrives in a later version of @naiuz/sdk.");
        expect(requests).toHaveLength(0);
    });

    it("retries a paid call after a 5xx, since nothing was charged", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable", {"retry-after": "0"}), json(200, completion));
        await testClient(fetch, {maxRetries: 1}).chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}]});
        expect(requests).toHaveLength(2);
    });

    it("retries models as a safe call, and the paid calls as paid", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        const client = testClient(mockFetch(json(200, {object: "list", data: []}), json(200, {}), json(200, {}), json(200, completion)).fetch);
        await client.models.list();
        await client.embeddings.create({model: "m", input: "x"});
        await client.rerank.create({model: "m", query: "q", documents: ["d"]});
        await client.chat.completions.create({model: "m", messages: [{role: "user", content: "x"}]});
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["safe", "paid", "paid", "paid"]);
    });
});
