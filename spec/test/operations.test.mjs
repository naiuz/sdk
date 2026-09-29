import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {listOperations} from "../scripts/lib/openapi.mjs";

const load = async (name) => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
const document = await load("openapi.json");
const map = await load("operations.json");
const entries = listOperations(document);

test("every operation in the document has an entry, and there are no others", () => {
    assert.deepEqual(Object.keys(map.operations).sort(), entries.map(({operationId}) => operationId).sort());
});

test("each entry's http line is the operation's method and path under base_path", () => {
    for (const {operationId, method, path} of entries) {
        const [entryMethod, entryPath] = map.operations[operationId].http.split(" ");
        assert.equal(entryMethod, method, operationId);
        assert.equal(`${map.base_path}${entryPath}`, path, operationId);
    }
});

test("each entry names its method in every SDK, in that language's style, once", () => {
    const styles = {python: /^[a-z_]+(\.[a-z_]+)*$/, ts: /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)*$/, php: /^[a-z][A-Za-z]*(->[a-z][A-Za-z]*)*$/};
    for (const [language, style] of Object.entries(styles)) {
        const names = Object.values(map.operations).map((entry) => entry[language]);
        for (const name of names) assert.match(name, style, `${language}: ${name}`);
        assert.equal(new Set(names).size, names.length, `${language} names are unique`);
    }
});

test("helpers only build on operations that exist", () => {
    for (const [name, helper] of Object.entries(map.helpers)) {
        for (const operationId of helper.uses) assert.ok(map.operations[operationId], `${name} uses ${operationId}`);
    }
});
