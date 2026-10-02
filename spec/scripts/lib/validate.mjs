import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {follow, listOperations, parametersOf} from "./openapi.mjs";

/** The API key every fixture's client is built with. */
export const FIXTURE_KEY = "nai_test_fixture_key";

const SPEC_ID = "https://github.com/naiuz/sdk/spec/openapi.json";
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
}

/**
 * A call's form fields as every SDK sends them: in each string, and each
 * string of a list, a lone CR, a lone LF and a CRLF all go as CRLF, the way an
 * HTML form encodes text.
 */
function asFormText(value) {
    if (typeof value === "string") return value.replace(/\r\n|\r|\n/g, "\r\n");
    if (Array.isArray(value)) return value.map(asFormText);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, asFormText(item)]));
    return value;
}

function sameJson(a, b) {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** A JSON Pointer's segments, unescaped: `~1` is `/` and `~0` is `~`. */
function segmentsOf(pointer) {
    return pointer.slice(1).split("/").map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** Whether `pointer` names a member of an object inside `value`. */
function namesMember(value, pointer) {
    const segments = segmentsOf(pointer);
    const name = segments.pop();
    let parent = value;
    for (const segment of segments) parent = parent !== null && typeof parent === "object" ? parent[segment] : undefined;
    return parent !== null && typeof parent === "object" && !Array.isArray(parent) && Object.hasOwn(parent, name);
}

/** A copy of `value` without the members `pointers` name. */
function withoutMembers(value, pointers) {
    const copy = structuredClone(value);
    for (const pointer of pointers) {
        const segments = segmentsOf(pointer);
        const name = segments.pop();
        let parent = copy;
        for (const segment of segments) parent = parent?.[segment];
        if (parent !== null && typeof parent === "object") delete parent[name];
    }
    return copy;
}

/**
 * Whether `errors` (ajv's, from validating a whole body with `allErrors`)
 * proves `pointer` is undeclared: an `unevaluatedProperties` or
 * `additionalProperties` error naming exactly this member, at its own
 * parent. A value merely rejected for some other reason (the wrong type, for
 * instance) is not proof the document fails to declare it.
 */
function isUndeclared(errors, pointer) {
    const parent = pointer.slice(0, pointer.lastIndexOf("/"));
    const name = segmentsOf(pointer).at(-1);
    return errors.some((error) => (error.keyword === "unevaluatedProperties" || error.keyword === "additionalProperties") && error.instancePath === parent && (error.params.unevaluatedProperty ?? error.params.additionalProperty) === name);
}

/**
 * Where an `unknown_fields` pointer must be absent from `result`: under
 * `result.body` for a compatible operation's `{body, cost}` shape (the
 * fixtures README's own convention), or `result` itself for an envelope or a
 * page, whose `result` already mirrors the body's own paths.
 */
function resultMirror(result) {
    return result !== null && typeof result === "object" && !Array.isArray(result) && Object.hasOwn(result, "body") ? result.body : result;
}

/**
 * Closes every object schema in place: a schema object that declares
 * `properties` but neither `additionalProperties` nor `unevaluatedProperties`
 * gets `unevaluatedProperties: false`, so ajv rejects fields the document
 * doesn't declare (including ones renamed to another undeclared name).
 */
function closeObjectSchemas(node) {
    if (Array.isArray(node)) {
        for (const item of node) closeObjectSchemas(item);
        return;
    }
    if (node === null || typeof node !== "object") return;
    if (node.properties && typeof node.properties === "object" && !Array.isArray(node.properties) && !Object.hasOwn(node, "additionalProperties") && !Object.hasOwn(node, "unevaluatedProperties")) {
        node.unevaluatedProperties = false;
    }
    for (const value of Object.values(node)) closeObjectSchemas(value);
}

/**
 * A path parameter value, percent-encoded per RFC 3986: every character
 * outside the unreserved set (A-Z a-z 0-9 - . _ ~) becomes UTF-8 %XX.
 * encodeURIComponent alone leaves !'()* unencoded, which RFC 3986 reserves.
 */
function encodePathParameter(value) {
    return encodeURIComponent(value).replaceAll("!", "%21").replaceAll("'", "%27").replaceAll("(", "%28").replaceAll(")", "%29").replaceAll("*", "%2A");
}

/** A query value as the server reads it: numbers for numeric schemas and enums, booleans for booleans. */
function coerceQueryValue(text, schema) {
    const types = [schema?.type].flat().filter(Boolean);
    const numericEnum = Array.isArray(schema?.enum) && schema.enum.some((value) => typeof value === "number");
    if ((types.includes("integer") || types.includes("number") || numericEnum) && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    if (types.includes("boolean") && (text === "true" || text === "false")) return text === "true";
    return text;
}

/**
 * Checks fixtures against one OpenAPI document and one operation map.
 * validate(fixture) returns the problems it finds, each a sentence; an empty
 * list means the fixture holds.
 */
export function createValidator({document, operations, fixtureSchema}) {
    const ajv = new Ajv2020({strict: false, allErrors: true});
    addFormats(ajv);
    const closedDocument = structuredClone(document);
    closeObjectSchemas(closedDocument);
    ajv.addSchema(closedDocument, SPEC_ID);
    const checkShape = ajv.compile(fixtureSchema);
    const entries = new Map(listOperations(document).map((entry) => [entry.operationId, entry]));
    const compiled = new Map();

    function checkAgainst(pointer, value) {
        // Paths such as /v1/tts/voices/{id} put braces in the pointer. They aren't legal
        // in a URI fragment, so they are percent-encoded; ajv decodes them to look up.
        const ref = `${SPEC_ID}${pointer.replaceAll("{", "%7B").replaceAll("}", "%7D")}`;
        if (!compiled.has(pointer)) compiled.set(pointer, ajv.compile({$ref: ref}));
        const check = compiled.get(pointer);
        return check(value) ? [] : check.errors;
    }

    function against(pointer, value, label) {
        return checkAgainst(pointer, value).map((error) => `${label}${error.instancePath} ${error.message}`);
    }

    function checkRoute(fixture, entry, mapped) {
        const problems = [];
        const [method, template] = mapped.http.split(" ");
        if (fixture.request.method !== method) problems.push(`request.method is ${fixture.request.method}; ${fixture.operationId} is ${method}`);
        const given = fixture.call.path_params ?? {};
        const declared = parametersOf(document, entry).filter((parameter) => parameter.in === "path").map((parameter) => parameter.name);
        for (const name of declared) if (!Object.hasOwn(given, name)) problems.push(`call.path_params lacks ${name}`);
        for (const name of Object.keys(given)) if (!declared.includes(name)) problems.push(`call.path_params.${name} is not a path parameter of ${fixture.operationId}`);
        const expected = template.replace(/\{([^}]+)\}/g, (whole, name) => (Object.hasOwn(given, name) ? encodePathParameter(given[name]) : whole));
        if (fixture.request.path !== expected) problems.push(`request.path is ${fixture.request.path}; the call sends ${expected}`);
        return problems;
    }

    function checkHeaders(fixture, entry) {
        const problems = [];
        const headers = fixture.request.headers;
        if (headers.authorization !== `Bearer ${FIXTURE_KEY}`) problems.push(`request.headers.authorization must be "Bearer ${FIXTURE_KEY}"`);
        const idempotent = parametersOf(document, entry).some((parameter) => parameter.in === "header" && parameter.name.toLowerCase() === "idempotency-key");
        const key = fixture.call.options?.idempotency_key;
        if (idempotent) {
            if (key === undefined) problems.push(`${fixture.operationId} takes an Idempotency-Key: pass call.options.idempotency_key`);
            else if (headers["idempotency-key"] !== key) problems.push("request.headers.idempotency-key must equal call.options.idempotency_key");
        } else {
            if (key !== undefined) problems.push(`${fixture.operationId} takes no Idempotency-Key`);
            if (Object.hasOwn(headers, "idempotency-key")) problems.push(`${fixture.operationId} must not send idempotency-key`);
        }
        return problems;
    }

    function checkQuery(fixture, entry) {
        const problems = [];
        const query = fixture.request.query ?? {};
        const declared = new Map(parametersOf(document, entry).filter((parameter) => parameter.in === "query").map((parameter) => [parameter.name, parameter]));
        for (const [name, text] of Object.entries(query)) {
            const parameter = declared.get(name);
            if (!parameter) {
                problems.push(`request.query.${name} is not a query parameter of ${fixture.operationId}`);
                continue;
            }
            const schema = follow(document, parameter.schema, `${parameter.pointer}/schema`);
            problems.push(...against(schema.pointer, coerceQueryValue(text, schema.value), `request.query.${name}`));
        }
        if (!entry.operation.requestBody) {
            const params = fixture.call.params ?? {};
            for (const [name, value] of Object.entries(params)) if (value === null) problems.push(`call.params.${name} is null: leave a query parameter out rather than passing null`);
            const sent = Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]));
            if (!sameJson(sent, query)) problems.push("request.query must equal call.params, each value as a string: the SDK sends the caller's query as it is");
        } else if (Object.keys(query).length > 0) {
            problems.push(`${fixture.operationId} takes its parameters in the body, not the query`);
        }
        return problems;
    }

    function checkRequestBody(fixture, entry) {
        const problems = [];
        const {body, headers} = fixture.request;
        if (!entry.operation.requestBody) {
            if (body !== null) problems.push(`${fixture.operationId} takes no request body`);
            if (Object.hasOwn(headers, "content-type")) problems.push("a request without a body sends no content-type");
            if (fixture.call.files) problems.push(`${fixture.operationId} takes no files`);
            return problems;
        }
        if (body === null) return [`${fixture.operationId} sends a request body`];
        const requestBody = follow(document, entry.operation.requestBody, `${entry.pointer}/requestBody`);
        const content = requestBody.value.content ?? {};
        const params = fixture.call.params ?? {};
        if (Object.hasOwn(body, "json")) {
            if (!content["application/json"]) return [`${fixture.operationId} takes no JSON body`];
            if (headers["content-type"] !== "application/json") problems.push("request.headers.content-type must be application/json");
            if (fixture.call.files) problems.push(`${fixture.operationId} takes no files`);
            problems.push(...against(`${requestBody.pointer}/content/application~1json/schema`, body.json, "request.body.json"));
            if (!sameJson(body.json, params)) problems.push("request.body.json must equal call.params: the SDK sends the caller's fields as they are");
            return problems;
        }
        if (!content["multipart/form-data"]) return [`${fixture.operationId} takes no multipart body`];
        if (!headers["content-type"]?.startsWith("multipart/form-data")) problems.push("request.headers.content-type must start with multipart/form-data");
        const {fields, files} = body.multipart;
        const asForm = {...fields, ...Object.fromEntries(Object.keys(files).map((name) => [name, "(file)"]))};
        problems.push(...against(`${requestBody.pointer}/content/multipart~1form-data/schema`, asForm, "request.body.multipart"));
        if (!sameJson(fields, asFormText(params))) problems.push("request.body.multipart.fields must equal call.params, each line break as CRLF");
        if (!sameJson(files, fixture.call.files ?? {})) problems.push("request.body.multipart.files must equal call.files");
        for (const [name, file] of Object.entries(files)) if (!BASE64.test(file.base64)) problems.push(`request.body.multipart.files.${name}.base64 is not base64`);
        return problems;
    }

    function checkResponse(fixture, entry) {
        const problems = [];
        const {status, headers, body} = fixture.response;
        const responses = entry.operation.responses ?? {};
        const key = Object.hasOwn(responses, String(status)) ? String(status) : status >= 400 && Object.hasOwn(responses, "default") ? "default" : null;
        if (key === null) return [`status ${status} is not declared for ${fixture.operationId}`];
        const response = follow(document, responses[key], `${entry.pointer}/responses/${key}`);
        const content = response.value.content ?? {};
        const contentType = headers["content-type"];
        const declaredHeaders = new Set(Object.keys(response.value.headers ?? {}).map((name) => name.toLowerCase()));
        for (const name of Object.keys(headers)) if (name !== "content-type" && !declaredHeaders.has(name)) problems.push(`response header ${name} is not declared for status ${key}`);
        if (declaredHeaders.has("x-request-id") && !headers["x-request-id"]) problems.push("response.headers lacks x-request-id");
        const unknown = fixture.unknown_fields ?? [];
        if (unknown.length > 0 && (body === null || !Object.hasOwn(body, "json"))) problems.push("unknown_fields applies only to a JSON response body");

        if (body === null) {
            if (Object.keys(content).length > 0) problems.push(`status ${key} carries a body (${Object.keys(content).join(", ")})`);
            if (contentType !== undefined) problems.push("a response without a body has no content-type");
            return problems;
        }
        if (Object.hasOwn(body, "json")) {
            if (!content["application/json"]) return [...problems, `status ${key} has no JSON body`];
            if (contentType !== "application/json") problems.push("response.headers.content-type must be application/json");
            const schema = `${response.pointer}/content/application~1json/schema`;
            const fullErrors = checkAgainst(schema, body.json);
            for (const pointer of unknown) {
                if (!namesMember(body.json, pointer)) problems.push(`unknown_fields names ${pointer}, which is not a field of response.body.json`);
                // Truly unknown: the closed-world check reports this exact member, at its own location, as unevaluated or additional.
                else if (!isUndeclared(fullErrors, pointer)) problems.push(`unknown_fields names ${pointer}, but the API document declares it: take it off unknown_fields`);
                else if (namesMember(resultMirror(fixture.result), pointer)) problems.push(`unknown_fields names ${pointer}, but fixture.result still has it: the result must leave it out`);
            }
            problems.push(...against(schema, withoutMembers(body.json, unknown), "response.body.json"));
            if (typeof body.json?.request_id === "string" && headers["x-request-id"] !== undefined && body.json.request_id !== headers["x-request-id"]) problems.push("response.body.json.request_id must equal the x-request-id header");
            return problems;
        }
        if (Object.hasOwn(body, "base64")) {
            const binary = Object.entries(content).filter(([, media]) => follow(document, media.schema, "#").value?.format === "binary").map(([type]) => type);
            if (binary.length === 0) return [...problems, `status ${key} has no binary body`];
            if (!binary.includes(contentType)) problems.push(`response.headers.content-type must be ${binary.join(" or ")}`);
            if (!BASE64.test(body.base64)) problems.push("response.body.base64 is not base64");
            return problems;
        }
        if (!content["text/event-stream"]) return [...problems, `status ${key} does not stream`];
        if (contentType !== "text/event-stream") problems.push("response.headers.content-type must be text/event-stream");
        if (body.sse.at(-1) !== "[DONE]") problems.push("an SSE body ends with [DONE]");
        body.sse.slice(0, -1).forEach((event, index) => {
            let parsed;
            try {
                parsed = JSON.parse(event);
            } catch {
                problems.push(`response.body.sse[${index}] is not JSON`);
                return;
            }
            if (parsed?.object === "chat.completion.chunk") return;
            if (!parsed?.error) {
                problems.push(`response.body.sse[${index}] is neither a chat.completion.chunk nor an error envelope`);
                return;
            }
            const errorResponse = Object.hasOwn(responses, "default") ? follow(document, responses.default, `${entry.pointer}/responses/default`) : null;
            if (!errorResponse?.value.content?.["application/json"]) {
                problems.push(`response.body.sse[${index}] is an error event, but ${fixture.operationId} declares no error envelope`);
                return;
            }
            problems.push(...against(`${errorResponse.pointer}/content/application~1json/schema`, parsed, `response.body.sse[${index}]`));
        });
        return problems;
    }

    return {
        validate(fixture) {
            if (!checkShape(fixture)) return checkShape.errors.map((error) => `fixture${error.instancePath} ${error.message}`);
            const entry = entries.get(fixture.operationId);
            if (!entry) return [`${fixture.operationId} is not an operation in spec/openapi.json`];
            const mapped = operations.operations[fixture.operationId];
            if (!mapped) return [`${fixture.operationId} is missing from spec/operations.json`];
            return [...checkRoute(fixture, entry, mapped), ...checkHeaders(fixture, entry), ...checkQuery(fixture, entry), ...checkRequestBody(fixture, entry), ...checkResponse(fixture, entry)];
        },
    };
}
