import {describe, expect, it} from "vitest";
import type {Account, ApiKeys, Chat, Completions, Embeddings, Models, Rerank, Stt, Tts, TtsJobs, Voices} from "../src/index";
import {testClient} from "./helpers/client";
import {mockFetch} from "./helpers/mock-fetch";

describe("the package's exports", () => {
    it("exports every resource class as a type", () => {
        const client = testClient(mockFetch().fetch);
        const account: Account = client.account;
        const voices: Voices = client.voices;
        const tts: Tts = client.tts;
        const ttsJobs: TtsJobs = client.tts.jobs;
        const stt: Stt = client.stt;
        const apiKeys: ApiKeys = client.apiKeys;
        const models: Models = client.models;
        const embeddings: Embeddings = client.embeddings;
        const rerank: Rerank = client.rerank;
        const chat: Chat = client.chat;
        const completions: Completions = client.chat.completions;
        expect(account).toBe(client.account);
        expect(voices).toBe(client.voices);
        expect(tts).toBe(client.tts);
        expect(ttsJobs).toBe(client.tts.jobs);
        expect(stt).toBe(client.stt);
        expect(apiKeys).toBe(client.apiKeys);
        expect(models).toBe(client.models);
        expect(embeddings).toBe(client.embeddings);
        expect(rerank).toBe(client.rerank);
        expect(chat).toBe(client.chat);
        expect(completions).toBe(client.chat.completions);
    });
});
