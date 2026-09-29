import {describe, expect, it} from "vitest";
import {NeuronAI} from "../../src/client";
import {SpeechAudio} from "../../src/core/audio";
import {Page} from "../../src/core/pagination";
import {makeAPIError} from "../../src/errors";
import type {SentRequest} from "../helpers/mock-fetch";
import {comparable, expectRequest, FIXTURE_KEY, type Fixture, listFixtures, loadFixture, OPERATIONS, projectError, projectResult, replay, resolveMethod, withoutUnknownFields} from "./harness";

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

describe("withoutUnknownFields on a compatible operation's {body, cost} result", () => {
    // A chat completion (a COMPATIBLE_OPERATIONS member) whose result is {body, cost}: unknown_fields
    // names a field of the body, so it must be stripped from result.body, never from the top-level
    // result itself, since cost there is the SDK's own header-derived field, not part of the body.
    const chatCompletion = (bodyExtra: Record<string, unknown>, pointer: string, resultCost: number | null): Fixture => ({
        description: "A chat completion whose body carries a field the API document doesn't declare.",
        operationId: "createChatCompletion",
        call: {params: {model: "gemma-4-26b-a4b", messages: [{role: "user", content: "Salom!"}]}},
        request: {
            method: "POST",
            path: "/chat/completions",
            headers: {authorization: `Bearer ${FIXTURE_KEY}`, "content-type": "application/json"},
            body: {json: {model: "gemma-4-26b-a4b", messages: [{role: "user", content: "Salom!"}]}},
        },
        response: {
            status: 200,
            headers: {"content-type": "application/json", "x-cost": "999", "x-request-id": "00000000-0000-4000-8000-000000000901"},
            body: {json: {id: "chatcmpl-x", object: "chat.completion", created: 1790000000, model: "gemma-4-26b-a4b", choices: [], ...bodyExtra}},
        },
        unknown_fields: [pointer],
        result: {body: {id: "chatcmpl-x", object: "chat.completion", created: 1790000000, model: "gemma-4-26b-a4b", choices: []}, cost: resultCost},
    });

    it("catches a mismatch that stripping the top-level result used to hide (the reviewer's /cost case)", async () => {
        // The body's own (undeclared) cost is 111; x-cost says the real price is 999. A fixture that
        // wrongly claims the SDK's own cost is null must fail once /cost is stripped from the right place.
        const fixture = chatCompletion({cost: 111}, "/cost", null);
        const {requests, result} = await replay(fixture);
        await expectRequest(requests, fixture.request);
        expect(comparable(withoutUnknownFields(result, fixture))).not.toEqual(comparable(fixture.result));
    });

    it("still passes a correctly authored fixture: the field is left out of the body mirror, cost untouched", async () => {
        const fixture = chatCompletion({experimental_field: "beta"}, "/experimental_field", 999);
        const {requests, result} = await replay(fixture);
        await expectRequest(requests, fixture.request);
        expect(comparable(withoutUnknownFields(result, fixture))).toEqual(comparable(fixture.result));
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
