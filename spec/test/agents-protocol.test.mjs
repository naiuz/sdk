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
