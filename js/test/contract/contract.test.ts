import {describe, expect, it} from "vitest";
import {NeuronAI} from "../../src/client";
import {SpeechAudio} from "../../src/core/audio";
import {Page} from "../../src/core/pagination";
import {makeAPIError} from "../../src/errors";
import {comparable, DEFERRED_FIXTURES, DEFERRED_METHODS, expectRequest, FIXTURE_KEY, listFixtures, loadFixture, OPERATIONS, projectError, projectResult, replay, resolveMethod} from "./harness";

const fixtures = listFixtures();
const replayable = fixtures.filter((file) => !DEFERRED_FIXTURES.includes(file));
const tsPaths = [...Object.values(OPERATIONS.operations), ...Object.values(OPERATIONS.helpers)].map((entry) => entry.ts);

describe("every replayable fixture", () => {
    it.each(replayable)("%s sends its request and returns its result", async (file) => {
        const fixture = loadFixture(file);
        const {request, result} = await replay(fixture);
        await expectRequest(request, fixture.request);
        expect(comparable(result)).toEqual(comparable(fixture.result));
    });
});

describe("every error fixture, deferred ones included", () => {
    const errors = fixtures.filter((file) => loadFixture(file).response.status >= 400);

    it.each(errors)("%s maps its answer to its error", (file) => {
        const {response, result} = loadFixture(file);
        const body = response.body !== null && "json" in response.body ? JSON.stringify(response.body.json) : "";
        const error = makeAPIError(response.status, "", new Headers(response.headers), body);
        expect(comparable(projectError(error))).toEqual(comparable(result));
    });
});

describe("what waits for a later version", () => {
    it("names only real fixtures and methods", () => {
        console.info(
            [
                `Deferred: ${String(DEFERRED_FIXTURES.length)} fixtures and ${String(DEFERRED_METHODS.length)} methods.`,
                ...DEFERRED_FIXTURES.map((file) => `  fixture ${file}`),
                ...DEFERRED_METHODS.map((method) => `  method ${method}`),
            ].join("\n"),
        );
        for (const file of DEFERRED_FIXTURES) expect(fixtures, file).toContain(file);
        for (const method of DEFERRED_METHODS) expect(tsPaths, method).toContain(method);
    });

    it.each(DEFERRED_FIXTURES)("%s can't replay yet", async (file) => {
        await expect(replay(loadFixture(file))).rejects.toThrow(/is not on the client|streaming arrives in a later version/);
    });
});

describe("coverage", () => {
    const client = new NeuronAI({apiKey: FIXTURE_KEY});

    it.each(tsPaths)("client.%s exists, unless it is deferred", (tsPath) => {
        if (DEFERRED_METHODS.includes(tsPath)) expect(resolveMethod(client, tsPath), `client.${tsPath} exists now: take it off DEFERRED_METHODS`).toBeUndefined();
        else expect(resolveMethod(client, tsPath)).toBeTypeOf("function");
    });

    it("replays a fixture for every operation whose method exists", () => {
        const replayed = new Set(replayable.map((file) => file.split("/")[0]));
        for (const [operationId, {ts}] of Object.entries(OPERATIONS.operations)) {
            if (!DEFERRED_METHODS.includes(ts)) expect(replayed, operationId).toContain(operationId);
        }
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
