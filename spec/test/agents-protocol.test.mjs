import {test} from "node:test";
import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// The agents protocol: every recorded session is a fixture of the fixture schema, and each of its frames is an
// event of the side that sent it, so the SDK and the engine can both replay them.
const dir = new URL("../agents/", import.meta.url);
const schema = JSON.parse(await readFile(new URL("events.schema.json", dir), "utf8"));
const fixtureSchema = JSON.parse(await readFile(new URL("fixture.schema.json", dir), "utf8"));
const ajv = addFormats(new Ajv2020({allErrors: true, strict: true, allowUnionTypes: true}));
ajv.addSchema(schema, "events");
const client = ajv.compile({$ref: "events#/$defs/ClientEvent"});
const server = ajv.compile({$ref: "events#/$defs/ServerEvent"});
const fixture = ajv.compile(fixtureSchema);
const fixtures = await Promise.all((await readdir(new URL("fixtures/", dir))).sort().map(async (name) =>
    [name, JSON.parse(await readFile(new URL(`fixtures/${name}`, dir), "utf8"))]));

const types = (union) => schema.$defs[union].oneOf.map((ref) => schema.$defs[ref.$ref.split("/").pop()].properties.type.const);

test("every fixture is a recorded session, and each frame is an event of its side", () => {
    assert.ok(fixtures.length > 0);
    for (const [name, recorded] of fixtures) {
        assert.ok(fixture(recorded), `${name}: ${ajv.errorsText(fixture.errors)}`);
        for (const [index, item] of recorded.frames.entries()) {
            // A close, or a binary audio frame, isn't a JSON event.
            if (item.close || item.audio) continue;
            const check = item.from === "client" ? client : server;
            assert.equal(check(item.frame), item.invalid !== true, `${name} #${index}: ${ajv.errorsText(check.errors)}`);
        }
    }
});

test("an unknown event, an extra field or a missing field is refused", () => {
    assert.equal(server({type: "agent_dance", event_id: 1}), false);
    assert.equal(server({type: "agent_response", event_id: 1, text: "Salom", extra: true}), false);
    assert.equal(client({type: "user_message", client_message_id: "c-1"}), false);
    assert.equal(client({type: "user_message", client_message_id: "c 1", text: "Salom"}), false);
    assert.equal(client({type: "user_message", client_message_id: "c-1", text: ""}), false);
});

test("every event the schema defines appears in a fixture, on its side", () => {
    const seen = (side) => new Set(fixtures.flatMap(([, recorded]) => recorded.frames
        .filter((item) => item.from === side && item.frame && item.invalid !== true)
        .map((item) => item.frame.type)));
    assert.deepEqual([...seen("client")].sort(), types("ClientEvent").sort());
    assert.deepEqual([...seen("server")].sort(), types("ServerEvent").sort());
});

const isCall = (recorded) => recorded.frames.some((item) =>
    item.frame?.type === "conversation_initiation_client_data" && item.frame.text_only === false);

test("an audio entry is the kind of its side", () => {
    const one = (item) => fixture({description: "One frame.", token: "session", frames: [item]});
    assert.equal(one({from: "client", audio: {kind: "agent", event_id: 1, ms: 20}}), false);
    assert.equal(one({from: "server", audio: {kind: "user", sequence: 0, ms: 20}}), false);
    assert.equal(one({from: "client", audio: {kind: "user", ms: 20}}), false);
    assert.equal(one({from: "server", audio: {kind: "agent", ms: 20}}), false);
    assert.equal(one({from: "client", audio: {kind: "user", sequence: 0, ms: 20, count: 30}}), true);
    assert.equal(one({from: "server", audio: {kind: "agent", event_id: 2, ms: 20, count: 5}}), true);
});

test("a call's microphone frames are numbered upward without repeats", () => {
    for (const [name, recorded] of fixtures) {
        let next = 0;
        for (const item of recorded.frames) {
            if (item.audio?.kind !== "user") continue;
            assert.ok(item.audio.sequence >= next, `${name}: frame ${item.audio.sequence} comes after ${next - 1}`);
            next = item.audio.sequence + (item.audio.count ?? 1);
        }
    }
});

test("agent audio belongs to a reply the fixture shows", () => {
    for (const [name, recorded] of fixtures) {
        const replies = new Set(recorded.frames
            .filter((item) => item.from === "server" && ["agent_response", "agent_chat_response_part"].includes(item.frame?.type))
            .map((item) => item.frame.event_id));
        for (const item of recorded.frames) {
            if (item.audio?.kind === "agent") assert.ok(replies.has(item.audio.event_id), `${name}: audio for reply ${item.audio.event_id}`);
        }
    }
});

test("a playback report never claims more of a reply than its audio so far", () => {
    for (const [name, recorded] of fixtures) {
        const received = new Map();
        for (const item of recorded.frames) {
            if (item.audio?.kind === "agent") {
                received.set(item.audio.event_id, (received.get(item.audio.event_id) ?? 0) + item.audio.ms * (item.audio.count ?? 1));
            }
            if (item.from === "client" && item.frame?.type === "playback") {
                const {event_id: eventId, played_ms: played} = item.frame;
                assert.ok(played <= (received.get(eventId) ?? 0), `${name}: ${played} ms of reply ${eventId} played, ${received.get(eventId) ?? 0} ms received`);
            }
        }
    }
});

test("every voice close code has a fixture", () => {
    const closes = fixtures.filter(([, recorded]) => isCall(recorded))
        .flatMap(([, recorded]) => recorded.frames.filter((item) => item.close).map((item) => `${item.close.code} ${item.close.reason}`));
    for (const expected of ["4003 not_allowed", "4008 taken_over", "4009 voice_limit", "4010 balance", "1000 max_duration"]) {
        assert.ok(closes.includes(expected), `no call closes with ${expected}`);
    }
});
