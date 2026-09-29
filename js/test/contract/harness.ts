import {readdirSync} from "node:fs";
import {expect} from "vitest";
import {NeuronAI} from "../../src/client";
import {DialogueAudio, SpeechAudio} from "../../src/core/audio";
import {Page} from "../../src/core/pagination";
import {Stream} from "../../src/core/streaming";
import {APIError, RateLimitError} from "../../src/errors";
import {mockFetch, type SentRequest} from "../helpers/mock-fetch";
import {readSpec, SPEC_DIR} from "../helpers/spec";

/** An upload in a fixture: its filename, content type and bytes. */
interface FixtureFile {
    filename: string;
    content_type: string;
    base64: string;
}

/** One contract fixture, as spec/fixture.schema.json defines it. */
export interface Fixture {
    description: string;
    operationId: string;
    call: {
        path_params?: Record<string, string>;
        params?: Record<string, unknown>;
        files?: Record<string, FixtureFile>;
        options?: {idempotency_key?: string};
    };
    request: {
        method: string;
        path: string;
        query?: Record<string, string>;
        headers: Record<string, string>;
        body: null | {json: unknown} | {multipart: {fields: Record<string, unknown>; files: Record<string, FixtureFile>}};
    };
    response: {
        status: number;
        headers: Record<string, string>;
        body: null | {json: unknown} | {base64: string} | {sse: string[]};
    };
    result: unknown;
}

interface OperationMap {
    base_path: string;
    operations: Record<string, {http: string; ts: string}>;
    helpers: Record<string, {ts: string}>;
}

interface OpenAPIOperation {
    parameters?: {in: string}[];
    requestBody?: unknown;
}

/** spec/operations.json: every operation's HTTP route and SDK method. */
export const OPERATIONS = readSpec("operations.json") as OperationMap;
const DOCUMENT = readSpec("openapi.json") as {paths: Record<string, Record<string, OpenAPIOperation | undefined> | undefined>};

/** The key every fixture's client is built with. */
export const FIXTURE_KEY = "nai_test_fixture_key";

const COMPATIBLE_OPERATIONS = new Set(["createChatCompletion", "listModels", "createEmbedding", "rerank"]);
const PAGE_OPERATIONS = new Set(["listVoices", "listApiKeys"]);
const AUDIO_OPERATIONS = new Set(["synthesizeSpeech", "synthesizeDialogue", "downloadTtsJobAudio"]);

/** Every fixture file under spec/fixtures, as `<operationId>/<name>.json`, sorted. */
export function listFixtures(): string[] {
    const root = new URL("fixtures/", SPEC_DIR);
    return readdirSync(root, {withFileTypes: true})
        .filter((entry) => entry.isDirectory())
        .flatMap((directory) =>
            readdirSync(new URL(`${directory.name}/`, root))
                .filter((name) => name.endsWith(".json"))
                .map((name) => `${directory.name}/${name}`),
        )
        .sort();
}

/** One fixture, parsed. */
export function loadFixture(file: string): Fixture {
    return readSpec(`fixtures/${file}`) as Fixture;
}

function operation(operationId: string): {method: string; path: string; ts: string} {
    const entry = OPERATIONS.operations[operationId];
    if (entry === undefined) throw new Error(`${operationId} is not in spec/operations.json`);
    const [method = "", path = ""] = entry.http.split(" ");
    return {method, path, ts: entry.ts};
}

/**
 * The method a ts path such as `tts.jobs.create` names on the client, bound
 * to its resource; undefined when the client has no such method.
 */
export function resolveMethod(client: NeuronAI, tsPath: string): ((...args: unknown[]) => unknown) | undefined {
    const names = tsPath.split(".");
    const methodName = names.pop() ?? "";
    let owner: unknown = client;
    for (const name of names) owner = typeof owner === "object" && owner !== null ? (owner as Record<string, unknown>)[name] : undefined;
    if (typeof owner !== "object" || owner === null) return undefined;
    const method = (owner as Record<string, unknown>)[methodName];
    if (typeof method !== "function") return undefined;
    const callable = method as (...args: unknown[]) => unknown;
    return (...args) => callable.apply(owner, args);
}

/** Whether the operation's method takes a params argument: the operation has a body or query parameters. */
function takesParams(operationId: string): boolean {
    const {method, path} = operation(operationId);
    const described = DOCUMENT.paths[`${OPERATIONS.base_path}${path}`]?.[method.toLowerCase()];
    if (described === undefined) throw new Error(`${operationId} is not in spec/openapi.json`);
    return described.requestBody !== undefined || (described.parameters ?? []).some((parameter) => parameter.in === "query");
}

/**
 * A fixture's call as the SDK's arguments: the path parameters in path order,
 * then params, with each upload as its bytes, filename and content type, then
 * options.
 */
export function argumentsFor(fixture: Fixture): unknown[] {
    const {path} = operation(fixture.operationId);
    const pathParams = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name = ""]) => fixture.call.path_params?.[name]);
    const files = Object.fromEntries(
        Object.entries(fixture.call.files ?? {}).map(([name, file]) => [name, {data: Buffer.from(file.base64, "base64"), filename: file.filename, contentType: file.content_type}]),
    );
    const params = takesParams(fixture.operationId) ? [{...fixture.call.params, ...files}] : [];
    const idempotencyKey = fixture.call.options?.idempotency_key;
    return [...pathParams, ...params, idempotencyKey === undefined ? undefined : {idempotencyKey}];
}

/** The fixture's canned answer, as fetch gives it. */
export function responseFor(fixture: Fixture): Response {
    const {status, headers, body} = fixture.response;
    let content: BodyInit | null = null;
    if (body !== null && "json" in body) content = JSON.stringify(body.json);
    if (body !== null && "base64" in body) content = Uint8Array.from(Buffer.from(body.base64, "base64"));
    if (body !== null && "sse" in body) content = body.sse.map((data) => `data: ${data}\n\n`).join("");
    return new Response(content, {status, headers});
}

/**
 * The SDK's result in the fixtures README's `result` shape: a Page as
 * `{data, next_cursor, request_id}`, audio as its bytes in base64 and each
 * header's field, a compatible endpoint's body as `{body, cost}`, any other
 * object as `{data, request_id}`, and nothing (a 204) as null. The shape
 * comes from the operation, and a result of another shape throws.
 */
export function projectResult(operationId: string, value: unknown): unknown {
    if (value === undefined) return null;
    if (PAGE_OPERATIONS.has(operationId) !== (value instanceof Page)) {
        throw new Error(PAGE_OPERATIONS.has(operationId) ? `${operationId} should return a page, but didn't.` : `${operationId} should not return a page, but did.`);
    }
    if (AUDIO_OPERATIONS.has(operationId) !== (value instanceof SpeechAudio)) {
        throw new Error(AUDIO_OPERATIONS.has(operationId) ? `${operationId} should return audio, but didn't.` : `${operationId} should not return audio, but did.`);
    }
    if (value instanceof Page) return {data: value.data as unknown, next_cursor: value.next_cursor, request_id: value.request_id};
    if (value instanceof SpeechAudio) return projectAudio(operationId, value);
    const attached = value as {request_id?: unknown; cost?: unknown};
    if (COMPATIBLE_OPERATIONS.has(operationId)) return {body: value, cost: attached.cost ?? null};
    return {data: value, request_id: attached.request_id ?? null};
}

/** Audio in the README's shape: the bytes in base64 and each header's field, plus a dialogue's turns and turn count. */
function projectAudio(operationId: string, audio: SpeechAudio): unknown {
    const fields = {
        audio_base64: Buffer.from(audio.audio).toString("base64"),
        content_type: audio.content_type,
        cost: audio.cost,
        character_count: audio.character_count,
        balance: audio.balance,
        voice_custom: audio.voice_custom,
        latency_ms: audio.latency_ms,
        replayed: audio.replayed,
        request_id: audio.request_id,
    };
    if (operationId !== "synthesizeDialogue") return fields;
    if (!(audio instanceof DialogueAudio)) throw new Error("synthesizeDialogue should return a DialogueAudio, but didn't.");
    return {...fields, turns: audio.turns, turn_count: audio.turn_count};
}

/** A stream in the README's `{chunks}` shape: every chunk before `[DONE]`, as the stream yields it. */
async function projectStream(value: unknown): Promise<unknown> {
    if (!(value instanceof Stream)) throw new Error("A call with stream: true should return a Stream, but didn't.");
    const chunks: unknown[] = [];
    for await (const chunk of value as Stream<unknown>) chunks.push(chunk);
    return {chunks};
}

/** A thrown APIError in the README's `{error: {...}}` shape. Anything else is thrown on, since no fixture expects it. */
export function projectError(error: unknown): unknown {
    if (!(error instanceof APIError)) throw error;
    return {
        error: {
            class: error.name,
            status: error.status,
            type: error.type,
            code: error.code,
            message: error.message,
            param: error.param,
            fields: error.fields,
            request_id: error.request_id,
            retry_after: error instanceof RateLimitError ? error.retry_after : null,
        },
    };
}

/**
 * A JSON value ready to compare under the README's rules: a key holding null
 * or undefined is dropped, so it matches a key that is absent. toEqual then
 * ignores key order and compares numbers by value.
 */
export function comparable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(comparable);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, item]) => item !== null && item !== undefined)
            .map(([key, item]) => [key, comparable(item)]),
    );
}

/**
 * Replays a fixture as the README says: a client with the fixture key, the
 * default base URL and no retries, whose fetch answers the call's one request
 * with the fixture's response. Resolves to the request sent and the
 * projected result; a call with `stream: true` is read to its end. Rejects
 * when the client has no method for the operation.
 */
export async function replay(fixture: Fixture): Promise<{request: SentRequest | undefined; result: unknown}> {
    const {fetch, requests} = mockFetch(() => responseFor(fixture));
    const client = new NeuronAI({apiKey: FIXTURE_KEY, maxRetries: 0, fetch});
    const {ts} = operation(fixture.operationId);
    const method = resolveMethod(client, ts);
    if (method === undefined) throw new Error(`client.${ts} is not on the client`);
    let result: unknown;
    try {
        const value = await method(...argumentsFor(fixture));
        result = fixture.call.params?.stream === true ? await projectStream(value) : projectResult(fixture.operationId, value);
    } catch (error) {
        result = projectError(error);
    }
    return {request: requests[0], result};
}

/**
 * A sent form in the fixtures' `{fields, files}` shape: repeated `name[]`
 * parts become a list under `name`, and each file its filename, content type
 * and bytes in base64.
 */
async function multipartOf(form: FormData | null): Promise<{fields: Record<string, unknown>; files: Record<string, FixtureFile>}> {
    if (form === null) throw new Error("The call sent no multipart form.");
    const fields: Record<string, string | string[]> = {};
    const files: Record<string, FixtureFile> = {};
    for (const [name, value] of form.entries()) {
        if (typeof value !== "string") {
            if (name in files) throw new Error(`The file ${name} was sent twice.`);
            files[name] = {filename: value.name, content_type: value.type, base64: Buffer.from(await value.arrayBuffer()).toString("base64")};
        } else if (name.endsWith("[]")) {
            const list = fields[name.slice(0, -2)];
            fields[name.slice(0, -2)] = Array.isArray(list) ? [...list, value] : [value];
        } else {
            if (name in fields) throw new Error(`The field ${name} was sent twice.`);
            fields[name] = value;
        }
    }
    return {fields, files};
}

/**
 * Asserts the SDK sent the fixture's request: method, path, query, every
 * fixture header with its value, and the body. A multipart body's
 * content-type only has to start with the fixture's, since fetch adds the
 * boundary after it.
 */
export async function expectRequest(sent: SentRequest | undefined, expected: Fixture["request"]): Promise<void> {
    if (sent === undefined) throw new Error("The call sent no request.");
    const multipart = expected.body !== null && "multipart" in expected.body;
    expect(sent.method).toBe(expected.method);
    expect(`${sent.url.origin}${sent.url.pathname}`).toBe(`https://my.neuronai.uz/api/v1${expected.path}`);
    expect(Object.fromEntries(sent.url.searchParams)).toEqual(expected.query ?? {});
    for (const [name, value] of Object.entries(expected.headers)) {
        const actual = sent.headers.get(name);
        if (multipart && name === "content-type") expect(actual?.startsWith(value), `${name}: ${String(actual)}`).toBe(true);
        else expect(actual, name).toBe(value);
    }
    if (expected.body === null) {
        expect(sent.body).toBeNull();
        expect(sent.form).toBeNull();
    } else if ("json" in expected.body) {
        expect(JSON.parse(sent.body ?? "null")).toStrictEqual(expected.body.json);
    } else {
        expect(await multipartOf(sent.form)).toStrictEqual(expected.body.multipart);
    }
}
