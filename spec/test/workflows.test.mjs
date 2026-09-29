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
