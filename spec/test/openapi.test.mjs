import {test} from "node:test";
import assert from "node:assert/strict";
import {follow, listOperations, parametersOf, pointerTo, valueAt} from "../scripts/lib/openapi.mjs";

const document = {
    openapi: "3.1.0",
    info: {title: "T", version: "1"},
    paths: {
        "/v1/tts/voices/{id}": {
            parameters: [{$ref: "#/components/parameters/VoiceId"}],
            get: {operationId: "retrieveVoice", parameters: [{name: "expand", in: "query", schema: {type: "string"}}], responses: {}},
            delete: {operationId: "deleteVoice", responses: {}},
        },
        "/v1/balance": {get: {operationId: "retrieveBalance", responses: {}}},
    },
    components: {
        parameters: {VoiceId: {name: "id", in: "path", required: true, schema: {type: "string"}}},
        schemas: {Loop: {$ref: "#/components/schemas/Loop"}},
    },
};

test("pointers escape ~ and / in each segment", () => {
    assert.equal(pointerTo("paths", "/v1/tts/voices/{id}", "get"), "#/paths/~1v1~1tts~1voices~1{id}/get");
    assert.equal(pointerTo("a~b"), "#/a~0b");
});

test("valueAt reads a pointer and refuses one that points nowhere", () => {
    assert.equal(valueAt(document, "#/paths/~1v1~1balance/get/operationId"), "retrieveBalance");
    assert.throws(() => valueAt(document, "#/paths/~1v1~1nope"), /Nothing at #\/paths\/~1v1~1nope/);
    assert.throws(() => valueAt(document, "other.json#/x"), /Only local references/);
});

test("follow resolves references to the value and the pointer it lives at, and stops on a loop", () => {
    const followed = follow(document, {$ref: "#/components/parameters/VoiceId"}, "#/paths/x/parameters/0");
    assert.equal(followed.value.name, "id");
    assert.equal(followed.pointer, "#/components/parameters/VoiceId");
    assert.throws(() => follow(document, {$ref: "#/components/schemas/Loop"}, "#"), /Circular reference/);
});

test("operations come in document order with their pointers", () => {
    assert.deepEqual(listOperations(document).map(({operationId, method, path, pointer}) => [operationId, method, path, pointer]), [
        ["retrieveVoice", "GET", "/v1/tts/voices/{id}", "#/paths/~1v1~1tts~1voices~1{id}/get"],
        ["deleteVoice", "DELETE", "/v1/tts/voices/{id}", "#/paths/~1v1~1tts~1voices~1{id}/delete"],
        ["retrieveBalance", "GET", "/v1/balance", "#/paths/~1v1~1balance/get"],
    ]);
});

test("parameters join the path's and the operation's, resolved, each with its pointer", () => {
    const [entry] = listOperations(document);
    assert.deepEqual(parametersOf(document, entry).map(({name, in: where, pointer}) => [name, where, pointer]), [
        ["id", "path", "#/components/parameters/VoiceId"],
        ["expand", "query", "#/paths/~1v1~1tts~1voices~1{id}/get/parameters/0"],
    ]);
});
