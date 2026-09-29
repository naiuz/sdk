import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read = (name) => readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");

test("CI checks the contract on every pull request and every push to main", async () => {
    const ci = await read("ci.yml");
    assert.match(ci, /pull_request:/);
    assert.match(ci, /branches: \[main\]/);
    assert.match(ci, /working-directory: spec/);
    for (const command of ["npm ci", "npm test", "npm run validate"]) assert.match(ci, new RegExp(`run: ${command}\\n`), command);
});

test("no workflow runs an action major built for Node 20", async () => {
    for (const name of ["ci.yml", "drift.yml", "js.yml"]) {
        const text = await read(name);
        assert.doesNotMatch(text, /actions\/(checkout|setup-node)@v[1-4]\b/);
    }
});

test("the JavaScript SDK's checks run on Node 20, 22 and 24 when js/ or spec/ changes", async () => {
    const js = await read("js.yml");
    assert.match(js, /pull_request:\n\s+paths:\n\s+- "js\/\*\*"\n\s+- "spec\/\*\*"\n\s+- "\.github\/workflows\/js\.yml"\n/);
    assert.match(js, /push:\n\s+branches: \[main\]\n\s+paths:\n\s+- "js\/\*\*"\n\s+- "spec\/\*\*"\n\s+- "\.github\/workflows\/js\.yml"\n/);
    assert.match(js, /node: \[20, 22, 24\]/);
    assert.match(js, /node-version: \$\{\{ matrix\.node \}\}/);
    assert.match(js, /working-directory: js\n/);
    assert.match(js, /cache-dependency-path: js\/package-lock\.json/);
    const steps = ["npm ci", "npm run lint", "npm run typecheck", "npm test", "npm run build"].map((command) => js.indexOf(`run: ${command}\n`));
    assert.ok(steps.every((index) => index > 0), "every step is there");
    assert.deepEqual([...steps].sort((a, b) => a - b), steps, "in this order");
});

test("the drift job runs daily and on demand, and only reports drift as drift", async () => {
    const drift = await read("drift.yml");
    assert.match(drift, /schedule:\n\s+- cron: /);
    assert.match(drift, /workflow_dispatch:/);
    assert.match(drift, /issues: write/);
    assert.match(drift, /node scripts\/refresh-spec\.mjs --check/);
    // Exit 1 is drift, which opens or updates the issue; any other failure fails the job instead.
    assert.match(drift, /if \[ "\$code" -ne 0 \] && \[ "\$code" -ne 1 \]; then exit "\$code"; fi/);
    assert.match(drift, /if: steps\.check\.outputs\.code == '1'/);
    assert.match(drift, /--label spec-drift/);
    assert.match(drift, /--jq '\.\[0\]\.number \/\/ empty'/);
});
