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
    for (const name of ["ci.yml", "drift.yml", "js.yml", "python.yml", "php.yml", "smoke.yml"]) {
        const text = await read(name);
        assert.doesNotMatch(text, /actions\/(checkout|setup-node)@v[1-4]\b/);
        assert.doesNotMatch(text, /(oven-sh\/setup-bun|denoland\/setup-deno)@v1\b/);
        assert.doesNotMatch(text, /astral-sh\/setup-uv@v[1-6]\b/);
        assert.doesNotMatch(text, /shivammathur\/setup-php@v1\b/);
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

test("the JavaScript SDK's built package runs mocked calls on Node, Bun and Deno", async () => {
    const js = await read("js.yml");
    assert.match(js, /run: npm run build\n\s+- run: node smoke\/runtimes\.mjs\n/);
    assert.match(js, /uses: oven-sh\/setup-bun@v2\n/);
    assert.match(js, /run: bun smoke\/runtimes\.mjs\n/);
    assert.match(js, /uses: denoland\/setup-deno@v2\n/);
    assert.match(js, /run: deno run --no-prompt --allow-read --allow-write --allow-net=127\.0\.0\.1 --allow-env=TMPDIR,TMP,TEMP smoke\/runtimes\.mjs\n/);
});

test("the Python SDK's checks run on Python 3.10 to 3.14 when python/ or spec/ changes", async () => {
    const python = await read("python.yml");
    assert.match(python, /pull_request:\n\s+paths:\n\s+- "python\/\*\*"\n\s+- "spec\/\*\*"\n\s+- "\.github\/workflows\/python\.yml"\n/);
    assert.match(python, /push:\n\s+branches: \[main\]\n\s+paths:\n\s+- "python\/\*\*"\n\s+- "spec\/\*\*"\n\s+- "\.github\/workflows\/python\.yml"\n/);
    assert.match(python, /python: \["3\.10", "3\.11", "3\.12", "3\.13", "3\.14"\]/);
    assert.match(python, /python-version: \$\{\{ matrix\.python \}\}/);
    assert.match(python, /working-directory: python\n/);
    // A test that hangs instead of failing must not hold a runner for GitHub's six hours.
    assert.match(python, /runs-on: ubuntu-latest\n\s+timeout-minutes: 15\n/);
    const steps = ["uv sync --locked", "uv run ruff check", "uv run ruff format --check", "uv run pyright", "uv run mypy", "uv run pytest", "uv build"].map((command) => python.indexOf(`run: ${command}\n`));
    assert.ok(steps.every((index) => index > 0), "every step is there");
    assert.deepEqual([...steps].sort((a, b) => a - b), steps, "in this order");
});

test("the PHP SDK's checks run on PHP 8.2 to 8.5 when php/ or spec/ changes", async () => {
    const php = await read("php.yml");
    assert.match(php, /pull_request:\n\s+paths:\n\s+- "php\/\*\*"\n\s+- "spec\/\*\*"\n\s+- "\.github\/workflows\/php\.yml"\n/);
    assert.match(php, /push:\n\s+branches: \[main\]\n\s+paths:\n\s+- "php\/\*\*"\n\s+- "spec\/\*\*"\n\s+- "\.github\/workflows\/php\.yml"\n/);
    assert.match(php, /php: \["8\.2", "8\.3", "8\.4", "8\.5"\]/);
    assert.match(php, /php-version: \$\{\{ matrix\.php \}\}\n\s+coverage: none\n/);
    assert.match(php, /working-directory: php\n/);
    // A test that hangs instead of failing must not hold a runner for GitHub's six hours.
    assert.match(php, /runs-on: ubuntu-latest\n\s+timeout-minutes: 15\n/);
    const steps = ["composer validate --strict", "composer install --no-interaction --no-progress", "vendor/bin/phpstan analyse --no-progress", "vendor/bin/php-cs-fixer check --diff", "vendor/bin/phpunit"].map((command) => php.indexOf(`run: ${command}\n`));
    assert.ok(steps.every((index) => index > 0), "every step is there");
    assert.deepEqual([...steps].sort((a, b) => a - b), steps, "in this order");
});

test("the PHP SDK's checks also run on Guzzle 7, which many apps still use", async () => {
    const php = await read("php.yml");
    assert.match(php, /name: PHP 8\.2 on Guzzle 7\n\s+runs-on: ubuntu-latest\n\s+timeout-minutes: 15\n/);
    assert.match(php, /run: composer update "guzzlehttp\/guzzle:\^7\.9" --with-all-dependencies --no-interaction --no-progress\n\s+- run: vendor\/bin\/phpunit\n/);
});

test("the live smoke tests run nightly and on demand, never on a pull request, with the key from the Actions secret", async () => {
    const smoke = await read("smoke.yml");
    assert.match(smoke, /schedule:\n\s+- cron: /);
    assert.match(smoke, /workflow_dispatch:/);
    assert.doesNotMatch(smoke, /pull_request/);
    assert.match(smoke, /working-directory: js\n/);
    assert.match(smoke, /run: npm run test:smoke\n\s+env:\n\s+NEURONAI_SMOKE_API_KEY: \$\{\{ secrets\.NEURONAI_SMOKE_API_KEY \}\}\n/);
});

test("the Python SDK's smoke tests run on their own, with the key in their step's env alone", async () => {
    const smoke = await read("smoke.yml");
    assert.match(smoke, /name: Python SDK\n\s+runs-on: ubuntu-latest\n\s+timeout-minutes: 15\n/);
    assert.match(smoke, /working-directory: python\n/);
    assert.match(smoke, /run: uv sync --locked\n/);
    assert.match(smoke, /run: uv run pytest smoke\n\s+env:\n\s+NEURONAI_SMOKE_API_KEY: \$\{\{ secrets\.NEURONAI_SMOKE_API_KEY \}\}\n/);
    // One mention per suite's step: never in a job's or the workflow's env, where every step would see it.
    assert.equal(smoke.match(/secrets\.NEURONAI_SMOKE_API_KEY/g)?.length, 2);
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
