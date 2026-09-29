#!/usr/bin/env node
import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {listOperations} from "./lib/openapi.mjs";
import {createValidator} from "./lib/validate.mjs";

const SPEC_DIR = fileURLToPath(new URL("..", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

/** Every fixture file under fixtures/<operationId>/, with its parsed content or why it could not be parsed. */
export async function collectFixtures(specDir) {
    const found = [];
    let directories = [];
    try {
        directories = await readdir(join(specDir, "fixtures"), {withFileTypes: true});
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    for (const directory of directories.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
        const names = (await readdir(join(specDir, "fixtures", directory))).filter((name) => name.endsWith(".json")).sort();
        for (const name of names) {
            const file = `fixtures/${directory}/${name}`;
            try {
                found.push({file, directory, fixture: await readJson(join(specDir, file))});
            } catch (error) {
                found.push({file, directory, error: `is not valid JSON: ${error.message}`});
            }
        }
    }
    return found;
}

/** Operations with no successful fixture, and fixtures filed under an operation that isn't theirs. */
export function coverageProblems(document, fixtures) {
    const problems = [];
    const covered = new Set(fixtures.filter(({fixture}) => fixture && fixture.response?.status >= 200 && fixture.response?.status < 300).map(({fixture}) => fixture.operationId));
    for (const {operationId} of listOperations(document)) if (!covered.has(operationId)) problems.push(`${operationId} has no fixture with a 2xx response`);
    for (const {file, directory, fixture} of fixtures) if (fixture && fixture.operationId !== directory) problems.push(`${file}: filed under ${directory} but its operationId is ${fixture.operationId}`);
    return problems;
}

export async function run({specDir = SPEC_DIR, log = console.log} = {}) {
    const [document, operations, fixtureSchema] = await Promise.all(["openapi.json", "operations.json", "fixture.schema.json"].map((name) => readJson(join(specDir, name))));
    const {validate} = createValidator({document, operations, fixtureSchema});
    const fixtures = await collectFixtures(specDir);
    const problems = [];
    for (const {file, fixture, error} of fixtures) {
        if (error) problems.push(`${file}: ${error}`);
        else for (const problem of validate(fixture)) problems.push(`${file}: ${problem}`);
    }
    problems.push(...coverageProblems(document, fixtures));
    if (problems.length > 0) {
        log(`${problems.join("\n")}\n\n${problems.length} problem(s) across ${fixtures.length} fixture(s).`);
        return 1;
    }
    log(`All ${fixtures.length} fixtures hold, and every operation has one.`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    run().then(
        (code) => process.exit(code),
        (error) => {
            console.error(error.stack ?? error.message);
            process.exit(2);
        },
    );
}
