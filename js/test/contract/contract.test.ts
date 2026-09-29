import {describe, expect, it} from "vitest";
import {NeuronAI} from "../../src/client";
import {SpeechAudio} from "../../src/core/audio";
import {Page} from "../../src/core/pagination";
import {makeAPIError} from "../../src/errors";
import type {SentRequest} from "../helpers/mock-fetch";
import {comparable, expectRequest, FIXTURE_KEY, listFixtures, loadFixture, OPERATIONS, projectError, projectResult, replay, resolveMethod, withoutUnknownFields} from "./harness";

const fixtures = listFixtures();
const tsPaths = [...Object.values(OPERATIONS.operations), ...Object.values(OPERATIONS.helpers)].map((entry) => entry.ts);

describe("every fixture", () => {
    it.each(fixtures)("%s sends its request and returns its result", async (file) => {
        const fixture = loadFixture(file);
        const {requests, result} = await replay(fixture);
        await expectRequest(requests, fixture.request);
        expect(comparable(withoutUnknownFields(result, fixture))).toEqual(comparable(fixture.result));
    });
});

describe("every error fixture", () => {
    const errors = fixtures.filter((file) => loadFixture(file).response.status >= 400);

    it.each(errors)("%s maps its answer to its error", (file) => {
        const {response, result} = loadFixture(file);
        const body = response.body !== null && "json" in response.body ? JSON.stringify(response.body.json) : "";
        const error = makeAPIError(response.status, "", new Headers(response.headers), body);
        expect(comparable(projectError(error))).toEqual(comparable(result));
    });
});

describe("coverage", () => {
    const client = new NeuronAI({apiKey: FIXTURE_KEY});

    it.each(tsPaths)("client.%s exists", (tsPath) => {
        expect(resolveMethod(client, tsPath)).toBeTypeOf("function");
    });

    it("replays a fixture for every operation", () => {
        const replayed = new Set(fixtures.map((file) => file.split("/")[0]));
        for (const operationId of Object.keys(OPERATIONS.operations)) expect(replayed, operationId).toContain(operationId);
    });
});

describe("expectRequest", () => {
    const sent = (url: string): SentRequest => ({url: new URL(url), method: "GET", headers: new Headers({authorization: `Bearer ${FIXTURE_KEY}`}), body: null, form: null, signal: null});
    const expected = {method: "GET", path: "/tts/voices", query: {limit: "3"}, headers: {authorization: `Bearer ${FIXTURE_KEY}`}, body: null};

    it("fails when the call sends a query key twice", async () => {
        await expect(expectRequest([sent("https://my.neuronai.uz/api/v1/tts/voices?limit=2&limit=3")], expected)).rejects.toThrow();
        await expect(expectRequest([sent("https://my.neuronai.uz/api/v1/tts/voices?limit=3")], expected)).resolves.toBeUndefined();
    });

    it("fails when the call sends more than one request", async () => {
        const once = sent("https://my.neuronai.uz/api/v1/tts/voices?limit=3");
        await expect(expectRequest([once, once], expected)).rejects.toThrow(/exactly one request/);
    });
});

describe("projectResult", () => {
    it("decides the shape from the operation, not from what the SDK returned", () => {
        const bareArray = Object.assign([], {request_id: "req-1"});
        expect(() => projectResult("listApiKeys", bareArray)).toThrow(/listApiKeys/);

        const page = new Page<never>({data: [], next_cursor: null, request_id: null}, () => {
            throw new Error("not called");
        });
        expect(() => projectResult("retrieveApiKey", page)).toThrow(/retrieveApiKey/);

        expect(() => projectResult("synthesizeSpeech", {request_id: "req-1"})).toThrow(/synthesizeSpeech/);
        expect(() => projectResult("retrieveVoice", new SpeechAudio(new Uint8Array(), new Headers()))).toThrow(/retrieveVoice/);
    });
});
