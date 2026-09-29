import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {run} from "../scripts/refresh-spec.mjs";
import {toPinnedText} from "../scripts/lib/normalize.mjs";

const doc = (extraPaths = {}) => ({
    openapi: "3.1.0",
    info: {title: "T", version: "1"},
    paths: {"/v1/balance": {get: {operationId: "retrieveBalance", responses: {"200": {description: "ok"}}}}, ...extraPaths},
});
const fakeFetch = (body, status = 200) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});
const quiet = () => {};

async function pinnedFile(content) {
    const path = join(await mkdtemp(join(tmpdir(), "naiuz-spec-")), "openapi.json");
    if (content !== undefined) await writeFile(path, content);
    return path;
}

test("pins the live document in the canonical text", async () => {
    const path = await pinnedFile();
    assert.equal(await run({check: false, pinnedPath: path, fetchImpl: fakeFetch(doc()), log: quiet}), 0);
    assert.equal(await readFile(path, "utf8"), toPinnedText(doc()));
});

test("finds no drift when the live document matches the pinned one", async () => {
    const path = await pinnedFile(toPinnedText(doc()));
    assert.equal(await run({check: true, pinnedPath: path, fetchImpl: fakeFetch(doc()), log: quiet}), 0);
});

test("reports drift, names the new operation, and leaves the pinned file alone", async () => {
    const path = await pinnedFile(toPinnedText(doc()));
    const lines = [];
    const live = doc({"/v1/usage": {get: {operationId: "retrieveUsage", responses: {"200": {description: "ok"}}}}});
    assert.equal(await run({check: true, pinnedPath: path, fetchImpl: fakeFetch(live), log: (line) => lines.push(line)}), 1);
    assert.match(lines.join("\n"), /operations added: retrieveUsage/);
    assert.equal(await readFile(path, "utf8"), toPinnedText(doc()));
});

for (const [name, fetchImpl, message] of [
    ["an unreachable host", async () => { throw new Error("getaddrinfo ENOTFOUND my.neuronai.uz"); }, /Could not reach .*ENOTFOUND/],
    ["a non-200 answer", fakeFetch("Service Unavailable", 503), /answered 503/],
    ["a body that is not JSON", fakeFetch("<html>down</html>"), /did not return JSON/],
    ["JSON that is not an OpenAPI document", fakeFetch({hello: "world"}), /did not return an OpenAPI document/],
]) {
    test(`fails on ${name} and leaves the pinned file alone`, async () => {
        const before = toPinnedText(doc());
        const path = await pinnedFile(before);
        await assert.rejects(run({check: false, pinnedPath: path, fetchImpl, log: quiet}), message);
        assert.equal(await readFile(path, "utf8"), before);
    });
}
