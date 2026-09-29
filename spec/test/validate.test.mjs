import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createValidator, FIXTURE_KEY} from "../scripts/lib/validate.mjs";

const fixtureSchema = JSON.parse(await readFile(new URL("../fixture.schema.json", import.meta.url), "utf8"));
const REQUEST_ID = {"X-Request-Id": {schema: {type: "string"}}};
const document = {
    openapi: "3.1.0",
    info: {title: "Test", version: "1"},
    paths: {
        "/v1/tts/synthesize": {
            post: {
                operationId: "synthesizeSpeech",
                parameters: [{name: "Idempotency-Key", in: "header", schema: {type: "string"}}],
                requestBody: {content: {"application/json": {schema: {$ref: "#/components/schemas/SynthesizeSpeechRequest"}}}},
                responses: {
                    "200": {description: "ok", headers: {"X-Cost": {schema: {type: "number"}}, ...REQUEST_ID}, content: {"audio/wav": {schema: {type: "string", format: "binary"}}}},
                    "422": {description: "invalid", headers: REQUEST_ID, content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorEnvelope"}}}},
                },
            },
        },
        "/v1/tts/voices": {
            get: {
                operationId: "listVoices",
                parameters: [{name: "limit", in: "query", schema: {type: ["integer", "null"], minimum: 1, maximum: 100}}, {name: "days", in: "query", schema: {enum: [7, 30]}}],
                responses: {"200": {description: "ok", headers: REQUEST_ID, content: {"application/json": {schema: {type: "object", required: ["data", "request_id"], properties: {data: {type: "array"}, request_id: {type: "string", format: "uuid"}}}}}}},
            },
            post: {
                operationId: "createVoice",
                parameters: [{name: "Idempotency-Key", in: "header", schema: {type: "string"}}],
                requestBody: {content: {"multipart/form-data": {schema: {$ref: "#/components/schemas/CreateVoiceRequest"}}}},
                responses: {"201": {description: "created", headers: REQUEST_ID, content: {"application/json": {schema: {type: "object", required: ["data", "request_id"], properties: {data: {type: "object"}, request_id: {type: "string", format: "uuid"}}}}}}},
            },
        },
        "/v1/tts/voices/{id}": {
            delete: {
                operationId: "deleteVoice",
                parameters: [{name: "id", in: "path", required: true, schema: {type: "string"}}],
                responses: {"204": {description: "gone", headers: REQUEST_ID}},
            },
        },
        "/v1/chat/completions": {
            post: {
                operationId: "createChatCompletion",
                requestBody: {content: {"application/json": {schema: {type: "object", required: ["model"], properties: {model: {type: "string"}, stream: {type: ["boolean", "null"]}}}}}},
                responses: {
                    "200": {description: "ok", headers: REQUEST_ID, content: {"application/json": {schema: {type: "object"}}, "text/event-stream": {schema: {type: "string"}}}},
                    default: {description: "error", headers: REQUEST_ID, content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorEnvelope"}}}},
                },
            },
        },
    },
    components: {
        schemas: {
            SynthesizeSpeechRequest: {type: "object", required: ["text"], properties: {text: {type: "string"}, voice_id: {type: ["string", "null"], maxLength: 128}}},
            CreateVoiceRequest: {
                type: "object",
                required: ["name", "language", "ref_audio"],
                properties: {
                    name: {type: "string", maxLength: 120},
                    language: {enum: ["uz", "en"]},
                    ref_audio: {type: "string", format: "binary"},
                    ref_text: {type: ["string", "null"]},
                },
            },
            ErrorEnvelope: {
                type: "object",
                required: ["error", "request_id"],
                properties: {
                    error: {
                        type: "object",
                        required: ["type", "code", "message", "param"],
                        properties: {type: {type: "string"}, code: {type: "string"}, message: {type: "string"}, param: {type: ["string", "null"]}, fields: {type: "object", additionalProperties: {type: "string"}}},
                    },
                    request_id: {type: "string", format: "uuid"},
                },
            },
        },
    },
};
const entry = (http) => ({http, python: "x", ts: "x", php: "x"});
const operations = {
    base_path: "/v1",
    operations: {
        synthesizeSpeech: entry("POST /tts/synthesize"),
        listVoices: entry("GET /tts/voices"),
        createVoice: entry("POST /tts/voices"),
        deleteVoice: entry("DELETE /tts/voices/{id}"),
        createChatCompletion: entry("POST /chat/completions"),
    },
    helpers: {},
};
const {validate} = createValidator({document, operations, fixtureSchema});
const RID = "00000000-0000-4000-8000-000000000001";
const AUTH = `Bearer ${FIXTURE_KEY}`;
const WAV = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

const synthesize = () => ({
    description: "Synthesizes a short line.",
    operationId: "synthesizeSpeech",
    call: {params: {text: "Salom", voice_id: "uz-sardor"}, options: {idempotency_key: "k1"}},
    request: {method: "POST", path: "/tts/synthesize", headers: {authorization: AUTH, "content-type": "application/json", "idempotency-key": "k1"}, body: {json: {text: "Salom", voice_id: "uz-sardor"}}},
    response: {status: 200, headers: {"content-type": "audio/wav", "x-cost": "12.5", "x-request-id": RID}, body: {base64: WAV}},
    result: {audio_base64: WAV},
});
const list = () => ({
    description: "Lists voices, two per page.",
    operationId: "listVoices",
    call: {params: {limit: 2}},
    request: {method: "GET", path: "/tts/voices", query: {limit: "2"}, headers: {authorization: AUTH}, body: null},
    response: {status: 200, headers: {"content-type": "application/json", "x-request-id": RID}, body: {json: {data: [], request_id: RID}}},
    result: {data: [], request_id: RID},
});
const remove = () => ({
    description: "Deletes a custom voice.",
    operationId: "deleteVoice",
    call: {path_params: {id: "v 1"}},
    request: {method: "DELETE", path: "/tts/voices/v%201", headers: {authorization: AUTH}, body: null},
    response: {status: 204, headers: {"x-request-id": RID}, body: null},
    result: null,
});
const stream = () => ({
    description: "Streams a chat completion.",
    operationId: "createChatCompletion",
    call: {params: {model: "m", stream: true}},
    request: {method: "POST", path: "/chat/completions", headers: {authorization: AUTH, "content-type": "application/json"}, body: {json: {model: "m", stream: true}}},
    response: {status: 200, headers: {"content-type": "text/event-stream", "x-request-id": RID}, body: {sse: ['{"object":"chat.completion.chunk","choices":[]}', "[DONE]"]}},
    result: {chunks: [{object: "chat.completion.chunk", choices: []}]},
});
const invalid = () => ({
    ...synthesize(),
    response: {
        status: 422,
        headers: {"content-type": "application/json", "x-request-id": RID},
        body: {json: {error: {type: "invalid_request_error", code: "invalid_request", message: "The text field is required.", param: "text", fields: {text: "The text field is required."}}, request_id: RID}},
    },
    result: {error: {class: "UnprocessableEntityError"}},
});
const clone = () => ({
    description: "Clones a voice from a reference clip.",
    operationId: "createVoice",
    call: {
        params: {name: "Aziza", language: "uz"},
        files: {ref_audio: {filename: "sample.wav", content_type: "audio/wav", base64: WAV}},
        options: {idempotency_key: "k3"},
    },
    request: {
        method: "POST",
        path: "/tts/voices",
        headers: {authorization: AUTH, "content-type": "multipart/form-data; boundary=x", "idempotency-key": "k3"},
        body: {multipart: {fields: {name: "Aziza", language: "uz"}, files: {ref_audio: {filename: "sample.wav", content_type: "audio/wav", base64: WAV}}}},
    },
    response: {status: 201, headers: {"content-type": "application/json", "x-request-id": RID}, body: {json: {data: {id: "v1"}, request_id: RID}}},
    result: {id: "v1"},
});
const edit = (fixture, change) => {
    change(fixture);
    return fixture;
};
const expectProblem = (fixture, pattern) => assert.ok(validate(fixture).some((problem) => pattern.test(problem)), `expected ${pattern} in ${JSON.stringify(validate(fixture))}`);

test("1. well-formed fixtures of every shape hold", () => {
    for (const fixture of [synthesize(), list(), remove(), stream(), invalid()]) assert.deepEqual(validate(fixture), [], fixture.description);
});

test("2. a fixture missing a required part fails its shape", () => {
    const fixture = synthesize();
    delete fixture.result;
    expectProblem(fixture, /must have required property 'result'/);
});

test("3. an operation the document doesn't have fails", () => {
    expectProblem(edit(synthesize(), (f) => { f.operationId = "nope"; }), /nope is not an operation in spec\/openapi.json/);
});

test("4. a path that isn't the call's fails, and path parameters are encoded", () => {
    expectProblem(edit(remove(), (f) => { f.request.path = "/tts/voices/v 1"; }), /request.path is \/tts\/voices\/v 1; the call sends \/tts\/voices\/v%201/);
});

test("5. a request without the fixture key fails", () => {
    expectProblem(edit(list(), (f) => { f.request.headers.authorization = "Bearer other"; }), /authorization must be "Bearer nai_test_fixture_key"/);
});

test("6. idempotency keys go on exactly the operations that take them", () => {
    expectProblem(edit(synthesize(), (f) => { delete f.call.options; delete f.request.headers["idempotency-key"]; }), /takes an Idempotency-Key/);
    expectProblem(edit(list(), (f) => { f.call.options = {idempotency_key: "k"}; f.request.headers["idempotency-key"] = "k"; }), /takes no Idempotency-Key/);
});

test("7. a renamed field fails: the SDK sends the caller's fields as they are", () => {
    expectProblem(edit(synthesize(), (f) => { f.request.body.json = {text: "Salom", voiceId: "uz-sardor"}; }), /request.body.json must equal call.params/);
});

test("8. a body missing a required field fails against the document", () => {
    expectProblem(edit(synthesize(), (f) => { f.call.params = {voice_id: "uz-sardor"}; f.request.body.json = {voice_id: "uz-sardor"}; }), /request.body.json must have required property 'text'/);
});

test("9. a query value of the wrong type fails", () => {
    expectProblem(edit(list(), (f) => { f.call.params = {limit: "abc"}; f.request.query = {limit: "abc"}; }), /request.query.limit must be integer/);
    assert.deepEqual(validate(edit(list(), (f) => { f.call.params = {days: 30}; f.request.query = {days: "30"}; })), [], "numeric enums compare as numbers");
});

test("10. a query that isn't the call's params fails", () => {
    expectProblem(edit(list(), (f) => { f.request.query = {limit: "3"}; }), /request.query must equal call.params/);
});

test("11. audio answered as JSON fails", () => {
    expectProblem(edit(synthesize(), (f) => { f.response.headers["content-type"] = "application/json"; }), /content-type must be audio\/wav/);
});

test("12. a status the operation doesn't declare fails", () => {
    expectProblem(edit(list(), (f) => { f.response.status = 418; }), /status 418 is not declared for listVoices/);
});

test("13. a 204 with a body fails", () => {
    expectProblem(edit(remove(), (f) => { f.response.body = {json: {}}; f.response.headers["content-type"] = "application/json"; }), /status 204 has no JSON body/);
});

test("14. a stream that doesn't end with [DONE] fails", () => {
    expectProblem(edit(stream(), (f) => { f.response.body.sse = ['{"object":"chat.completion.chunk","choices":[]}']; }), /ends with \[DONE\]/);
});

test("15. the error envelope keeps its real shape: a request_id, and fields as a map of strings", () => {
    expectProblem(edit(invalid(), (f) => { delete f.response.body.json.request_id; }), /must have required property 'request_id'/);
    expectProblem(edit(invalid(), (f) => { f.response.body.json.error.fields = {text: ["The text field is required."]}; }), /fields\/text must be string/);
});

test("16. a response header the status doesn't declare fails, and x-request-id is required", () => {
    expectProblem(edit(list(), (f) => { f.response.headers["x-cost"] = "1"; }), /response header x-cost is not declared for status 200/);
    expectProblem(edit(list(), (f) => { delete f.response.headers["x-request-id"]; }), /response.headers lacks x-request-id/);
});

test("17. a well-formed multipart fixture holds", () => {
    assert.deepEqual(validate(clone()), [], clone().description);
});

test("18. a multipart body sent with a non-multipart content-type fails, and a JSON body sent to a multipart-only operation fails", () => {
    expectProblem(edit(clone(), (f) => { f.request.headers["content-type"] = "application/json"; }), /content-type must start with multipart\/form-data/);
    expectProblem(edit(clone(), (f) => { f.request.body = {json: {name: "Aziza", language: "uz"}}; }), /createVoice takes no JSON body/);
});

test("19. a multipart field outside the document's enum fails, and a missing required file fails", () => {
    expectProblem(edit(clone(), (f) => { f.call.params.language = "xx"; f.request.body.multipart.fields.language = "xx"; }), /multipart\/language must be equal to one of the allowed values/);
    expectProblem(edit(clone(), (f) => { delete f.call.files.ref_audio; f.request.body.multipart.files = {}; }), /request.body.multipart must have required property 'ref_audio'/);
});

test("20. multipart fields that aren't call.params fail, and files that aren't call.files fail", () => {
    expectProblem(edit(clone(), (f) => { f.request.body.multipart.fields = {name: "Aziza", language: "uz", nickname: "Az"}; }), /request.body.multipart.fields must equal call.params/);
    expectProblem(edit(clone(), (f) => { f.request.body.multipart.files.ref_audio.filename = "other.wav"; }), /request.body.multipart.files must equal call.files/);
});

test("21. a file whose base64 isn't base64 fails", () => {
    expectProblem(edit(clone(), (f) => { f.call.files.ref_audio.base64 = "not_base64!"; f.request.body.multipart.files.ref_audio.base64 = "not_base64!"; }), /request.body.multipart.files.ref_audio.base64 is not base64/);
});

test("22. call.files on a JSON operation fails, and on an operation without a request body fails", () => {
    expectProblem(edit(synthesize(), (f) => { f.call.files = {extra: {filename: "x.txt", content_type: "text/plain", base64: "AA=="}}; }), /synthesizeSpeech takes no files/);
    expectProblem(edit(remove(), (f) => { f.call.files = {extra: {filename: "x.txt", content_type: "text/plain", base64: "AA=="}}; }), /deleteVoice takes no files/);
});

test("23. a field renamed in both the call and the body fails against the document", () => {
    // voice_id is declared but not required: today, renaming it the same way on both sides reports nothing.
    expectProblem(edit(synthesize(), (f) => { f.call.params = {text: "Salom", voiceId: "uz-sardor"}; f.request.body.json = {text: "Salom", voiceId: "uz-sardor"}; }), /request\.body\.json must NOT have unevaluated properties/);
});

test("24. a response field the document doesn't declare fails", () => {
    expectProblem(edit(invalid(), (f) => { f.response.body.json.error.owner_email = "owner@example.test"; }), /response\.body\.json\S* must NOT have unevaluated properties/);
});

test("25. an error event inside a stream keeps the envelope's shape", () => {
    const badError = '{"error":{"type":"invalid_request_error","code":"invalid_request","message":"Bad request.","param":null,"fields":["The text field is required."]}}';
    expectProblem(edit(stream(), (f) => { f.response.body.sse = [f.response.body.sse[0], badError, "[DONE]"]; }), /response\.body\.sse\[1\]/);
});
