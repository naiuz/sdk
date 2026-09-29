import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {collectFixtures, coverageProblems} from "../scripts/validate-fixtures.mjs";

const document = {
    openapi: "3.1.0",
    info: {title: "T", version: "1"},
    paths: {"/v1/a": {get: {operationId: "getA", responses: {}}}, "/v1/b": {get: {operationId: "getB", responses: {}}}},
};
const fixture = (operationId, status) => ({operationId, response: {status}});

test("an operation with no successful fixture is named", () => {
    const fixtures = [{file: "fixtures/getA/ok.json", directory: "getA", fixture: fixture("getA", 200)}, {file: "fixtures/getB/err.json", directory: "getB", fixture: fixture("getB", 404)}];
    assert.deepEqual(coverageProblems(document, fixtures), ["getB has no fixture with a 2xx response"]);
});

test("a fixture filed under another operation is named", () => {
    const fixtures = [{file: "fixtures/getA/ok.json", directory: "getA", fixture: fixture("getA", 200)}, {file: "fixtures/getA/b.json", directory: "getA", fixture: fixture("getB", 200)}];
    assert.deepEqual(coverageProblems(document, fixtures), ["fixtures/getA/b.json: filed under getA but its operationId is getB"]);
});

test("fixture files are collected per operation directory, and a file that isn't JSON is reported", async () => {
    const specDir = await mkdtemp(join(tmpdir(), "naiuz-fixtures-"));
    await mkdir(join(specDir, "fixtures", "getA"), {recursive: true});
    await writeFile(join(specDir, "fixtures", "getA", "ok.json"), JSON.stringify(fixture("getA", 200)));
    await writeFile(join(specDir, "fixtures", "getA", "broken.json"), "{");
    const found = await collectFixtures(specDir);
    assert.deepEqual(found.map(({file, fixture: parsed, error}) => [file, Boolean(parsed), Boolean(error)]), [
        ["fixtures/getA/broken.json", false, true],
        ["fixtures/getA/ok.json", true, false],
    ]);
});
