import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, expectTypeOf, test} from "vitest";
import {CLIENT_EVENT_TYPES, SERVER_EVENT_TYPES, type ServerEvent} from "../src/index";

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

    test("narrow by type", () => {
        expectTypeOf<Extract<ServerEvent, {type: "message_ack"}>>().toHaveProperty("client_message_id").toEqualTypeOf<string>();
        expectTypeOf<Extract<ServerEvent, {type: "handoff"}>["reason"]>().toEqualTypeOf<"agent" | "agent_failed" | "balance">();
    });
});
