// Writes src/events.ts from spec/agents/events.schema.json. With --check, it writes nothing and fails when the file
// is stale. It knows only the constructs the schema uses, and throws on anything else, so the schema can't outgrow it
// without anyone noticing. --schema <file> --print generates from another schema to stdout, for the generator's tests.
import {readFileSync, writeFileSync} from "node:fs";

const SCHEMA = new URL("../../../spec/agents/events.schema.json", import.meta.url);
const OUT = new URL("../src/events.ts", import.meta.url);

/** Keywords that only constrain values the types already allow, or describe them. */
const ANNOTATIONS = new Set(["description", "format", "pattern", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]);
const SCALARS = {string: "string", integer: "number", number: "number", boolean: "boolean", null: "null"};

function fail(path, message) {
    throw new Error(`${path}: ${message}`);
}

function refName(ref, path) {
    const match = /^#\/\$defs\/([A-Za-z]+)$/.exec(ref);
    if (match === null) fail(path, `unsupported $ref ${ref}`);
    return match[1];
}

function checkKeywords(schema, allowed, path) {
    for (const key of Object.keys(schema)) {
        if (!allowed.has(key) && !ANNOTATIONS.has(key)) fail(path, `unsupported keyword "${key}"`);
    }
}

function union(types) {
    return types.length === 1 ? types[0] : types.join(" | ");
}

/** The TypeScript type of a property's schema. */
function typeOf(schema, path, indent) {
    if ("anyOf" in schema) {
        checkKeywords(schema, new Set(["anyOf"]), path);
        const [first, second, ...rest] = schema.anyOf;
        if (rest.length > 0 || first === undefined || second === undefined || !("$ref" in first) || second.type !== "null" || Object.keys(second).length !== 1) {
            fail(path, "unsupported anyOf: only a reference or null");
        }
        return `${typeOf(first, `${path}/anyOf/0`, indent)} | null`;
    }
    if ("$ref" in schema) {
        checkKeywords(schema, new Set(["$ref"]), path);
        return refName(schema.$ref, path);
    }
    if ("const" in schema) {
        checkKeywords(schema, new Set(["const"]), path);
        return JSON.stringify(schema.const);
    }
    if ("enum" in schema) {
        checkKeywords(schema, new Set(["enum"]), path);
        return union(schema.enum.map((value) => JSON.stringify(value)));
    }
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.includes("object")) {
        if (types.length > 1) fail(path, "an object can't share its type");
        return objectType(schema, path, indent);
    }
    if (types.includes("array")) {
        if (types.length > 1) fail(path, "an array can't share its type");
        checkKeywords(schema, new Set(["type", "items"]), path);
        const item = typeOf(schema.items, `${path}/items`, indent);
        return item.includes(" | ") ? `(${item})[]` : `${item}[]`;
    }
    checkKeywords(schema, new Set(["type"]), path);
    return union(types.map((type) => SCALARS[type] ?? fail(path, `unsupported type ${type}`)));
}

function objectType(schema, path, indent) {
    checkKeywords(schema, new Set(["type", "properties", "required", "additionalProperties"]), path);
    const properties = Object.entries(schema.properties ?? {});
    // Any JSON object: a tool's parameters, which the tool's own schema describes.
    if (properties.length === 0 && schema.additionalProperties === true) return "Record<string, unknown>";
    if (properties.length === 0 && typeof schema.additionalProperties === "object") {
        return `Record<string, ${typeOf(schema.additionalProperties, `${path}/additionalProperties`, indent)}>`;
    }
    if (schema.additionalProperties !== false) fail(path, "an object with properties must forbid others");
    if (properties.length === 0) return "Record<string, never>";
    return `{\n${fields(schema, path, `${indent}    `)}${indent}}`;
}

function fields(schema, path, indent) {
    const required = new Set(schema.required ?? []);
    let out = "";
    for (const [name, property] of Object.entries(schema.properties)) {
        if (property.description) out += `${indent}/** ${property.description} */\n`;
        out += `${indent}${name}${required.has(name) ? "" : "?"}: ${typeOf(property, `${path}/properties/${name}`, indent)};\n`;
    }
    return out;
}

function declaration(name, schema) {
    const path = `#/$defs/${name}`;
    const doc = schema.description ? `/** ${schema.description} */\n` : "";
    if ("oneOf" in schema) {
        checkKeywords(schema, new Set(["oneOf"]), path);
        return `${doc}export type ${name} =\n${schema.oneOf.map((member) => `    | ${refName(member.$ref, path)}`).join("\n")};\n`;
    }
    if (schema.type === "object" && schema.properties && Object.keys(schema.properties).length > 0) {
        checkKeywords(schema, new Set(["type", "properties", "required", "additionalProperties"]), path);
        if (schema.additionalProperties !== false) fail(path, "an object with properties must forbid others");
        return `${doc}export interface ${name} {\n${fields(schema, path, "    ")}}\n`;
    }
    return `${doc}export type ${name} = ${typeOf(schema, path, "")};\n`;
}

function eventTypes(schema, union) {
    const types = schema.$defs[union].oneOf.map((member) => schema.$defs[refName(member.$ref, union)].properties.type.const);
    return `[${types.map((type) => JSON.stringify(type)).join(", ")}]`;
}

export function generate(schema) {
    const parts = [
        "// Generated from spec/agents/events.schema.json by scripts/generate.mjs. Do not edit.\n",
        ...Object.entries(schema.$defs).map(([name, definition]) => declaration(name, definition)),
        `/** Every event type a client sends. */\nexport const CLIENT_EVENT_TYPES = ${eventTypes(schema, "ClientEvent")} as const;\n`,
        `/** Every event type the server sends. */\nexport const SERVER_EVENT_TYPES = ${eventTypes(schema, "ServerEvent")} as const;\n`,
    ];
    return parts.join("\n");
}

const schemaAt = process.argv.indexOf("--schema");
const source = schemaAt === -1 ? SCHEMA : process.argv[schemaAt + 1];
const expected = generate(JSON.parse(readFileSync(source, "utf8")));
if (process.argv.includes("--print")) {
    process.stdout.write(expected);
} else if (process.argv.includes("--check")) {
    let current = "";
    try {
        current = readFileSync(OUT, "utf8");
    } catch {
        // A missing file is stale too.
    }
    if (current !== expected) {
        console.error("src/events.ts is stale: run npm run generate.");
        process.exit(1);
    }
} else {
    writeFileSync(OUT, expected);
}
