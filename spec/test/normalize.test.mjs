import {test} from "node:test";
import assert from "node:assert/strict";
import {describeDrift, formatDrift, sameDocument, toPinnedText} from "../scripts/lib/normalize.mjs";

const operation = (operationId, extra = {}) => ({operationId, responses: {"200": {description: "ok"}}, ...extra});
const doc = (paths, schemas = {}, version = "1") => ({openapi: "3.1.0", info: {title: "T", version}, paths, components: {schemas}});

test("the pinned text is two-space JSON with a final newline", () => {
    assert.equal(toPinnedText({b: 1, a: [2]}), '{\n  "b": 1,\n  "a": [\n    2\n  ]\n}\n');
});

test("documents are the same whatever the key order, but not whatever the array order", () => {
    assert.equal(sameDocument({a: 1, b: {c: 2, d: 3}}, {b: {d: 3, c: 2}, a: 1}), true);
    assert.equal(sameDocument({a: [1, 2]}, {a: [2, 1]}), false);
    assert.equal(sameDocument({a: 1}, {a: 1, b: undefined}), false);
});

test("drift names operations and schemas added, removed and changed", () => {
    const pinned = doc({"/v1/a": {get: operation("getA")}, "/v1/b": {get: operation("getB")}}, {A: {type: "object"}, B: {type: "string"}});
    const live = doc({"/v1/a": {get: operation("getA", {summary: "changed"})}, "/v1/c": {post: operation("postC")}}, {A: {type: "object", required: ["x"]}, C: {type: "integer"}});
    assert.deepEqual(describeDrift(pinned, live), {
        addedOperations: ["postC"],
        removedOperations: ["getB"],
        changedOperations: ["getA"],
        addedSchemas: ["C"],
        removedSchemas: ["B"],
        changedSchemas: ["A"],
        otherChanges: true,
    });
});

test("a change outside operations and schemas is reported as other changes", () => {
    const drift = describeDrift(doc({"/v1/a": {get: operation("getA")}}), doc({"/v1/a": {get: operation("getA")}}, {}, "2"));
    assert.equal(drift.otherChanges, true);
    assert.deepEqual([drift.addedOperations, drift.changedOperations, drift.changedSchemas], [[], [], []]);
});

test("the drift report lists each kind of change on its own line", () => {
    const text = formatDrift({addedOperations: ["postC"], removedOperations: [], changedOperations: ["getA"], addedSchemas: [], removedSchemas: ["B"], changedSchemas: [], otherChanges: false});
    assert.equal(text, "The live document differs from spec/openapi.json:\n- operations added: postC\n- operations changed: getA\n- schemas removed: B");
});
