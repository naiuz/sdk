import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, expectTypeOf, test} from "vitest";
import {CLIENT_EVENT_TYPES, SERVER_EVENT_TYPES, type AudioFormats, type ConversationInitiationMetadata, type ServerEvent} from "../src/index";

interface Schema {
    $defs: Record<string, {oneOf?: {$ref: string}[]; properties?: {type?: {const?: string}}}>;
}

const schema = JSON.parse(readFileSync(new URL("../../../spec/agents/events.schema.json", import.meta.url), "utf8")) as Schema;

function typesOf(union: string): string[] {
    return (schema.$defs[union]?.oneOf ?? []).map((ref) => schema.$defs[ref.$ref.split("/").pop() ?? ""]?.properties?.type?.const ?? "");
}

describe("the generated types", () => {
    test("are current with the schema", () => {
        const cwd = fileURLToPath(new URL("..", import.meta.url));
        expect(() => execFileSync("node", ["scripts/generate.mjs", "--check"], {cwd, stdio: "pipe"})).not.toThrow();
    });

    test("name every event of each side", () => {
        expect([...CLIENT_EVENT_TYPES].sort()).toEqual(typesOf("ClientEvent").sort());
        expect([...SERVER_EVENT_TYPES].sort()).toEqual(typesOf("ServerEvent").sort());
    });

    test("make a reference or null a nullable type", () => {
        expectTypeOf<ConversationInitiationMetadata["audio"]>().toEqualTypeOf<AudioFormats | null>();
    });

    test("refuse any other anyOf", () => {
        const cwd = fileURLToPath(new URL("..", import.meta.url));
        const file = join(mkdtempSync(join(tmpdir(), "agents-protocol-")), "schema.json");
        writeFileSync(file, JSON.stringify({$defs: {
            Thing: {type: "object", properties: {value: {anyOf: [{$ref: "#/$defs/Other"}, {type: "string"}]}}, required: ["value"], additionalProperties: false},
            Other: {type: "string"},
            ClientEvent: {oneOf: []},
            ServerEvent: {oneOf: []},
        }}));
        expect(() => execFileSync("node", ["scripts/generate.mjs", "--schema", file, "--print"], {cwd, stdio: "pipe"})).toThrow(/unsupported anyOf/);
    });

    test("narrow by type", () => {
        expectTypeOf<Extract<ServerEvent, {type: "message_ack"}>>().toHaveProperty("client_message_id").toEqualTypeOf<string>();
        expectTypeOf<Extract<ServerEvent, {type: "handoff"}>["reason"]>().toEqualTypeOf<"agent" | "agent_failed" | "balance">();
    });
});
