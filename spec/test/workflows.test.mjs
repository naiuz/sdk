import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, readdir, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const read = (name) => readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");
const workflows = async () => (await readdir(new URL("../../.github/workflows/", import.meta.url))).filter((name) => name.endsWith(".yml")).sort();

// Every action the workflows use, pinned to the commit its release tag named when it was looked up with git ls-remote:
// a tag that moves changes nothing here. Each of these releases runs on Node 24. To update one, look up the new tag's
// commit and change it here and in every workflow at once.
const ACTIONS = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "actions/setup-node": "820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
    "astral-sh/setup-uv": "c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0",
    "denoland/setup-deno": "22d081ff2d3a40755e97629de92e3bcbfa7cf2ed # v2.0.5",
    "oven-sh/setup-bun": "0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0",
    "shivammathur/setup-php": "f3e473d116dcccaddc5834248c87452386958240 # v2, at 2.37.2",
};

test("CI checks the contract on every pull request and every push to main", async () => {
    const ci = await read("ci.yml");
    assert.match(ci, /pull_request:/);
    assert.match(ci, /branches: \[main\]/);
    assert.match(ci, /working-directory: spec/);
    for (const command of ["npm ci", "npm test", "npm run validate"]) assert.match(ci, new RegExp(`run: ${command}\\n`), command);
});

test("every action a workflow uses is pinned to a commit, with the release it was as a comment", async () => {
    for (const name of await workflows()) {
        const text = await read(name);
        const uses = [...text.matchAll(/uses: ([\w.-]+\/[\w.-]+)@(.+)\n/g)];
        assert.equal(uses.length, text.match(/uses:/g)?.length ?? 0, `${name}: every uses: names an action and a ref`);
        for (const [, action, ref] of uses) assert.equal(ref, ACTIONS[action], `${name}: ${action}`);
    }
});

test("every job runs on Ubuntu 24.04, whatever ubuntu-latest moves to", async () => {
    for (const name of await workflows()) {
        const text = await read(name);
        assert.match(text, /runs-on: ubuntu-24\.04\n/, name);
        assert.doesNotMatch(text, /runs-on: (?!ubuntu-24\.04\n)/, name);
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
    assert.match(js, /uses: oven-sh\/setup-bun@/);
    assert.match(js, /run: bun smoke\/runtimes\.mjs\n/);
    assert.match(js, /uses: denoland\/setup-deno@/);
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
    assert.match(python, /runs-on: ubuntu-24\.04\n\s+timeout-minutes: 15\n/);
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
    assert.match(php, /runs-on: ubuntu-24\.04\n\s+timeout-minutes: 15\n/);
    const steps = ["composer validate --strict", "composer install --no-interaction --no-progress", "vendor/bin/phpstan analyse --no-progress", "vendor/bin/php-cs-fixer check --diff", "vendor/bin/phpunit"].map((command) => php.indexOf(`run: ${command}\n`));
    assert.ok(steps.every((index) => index > 0), "every step is there");
    assert.deepEqual([...steps].sort((a, b) => a - b), steps, "in this order");
});

test("the PHP SDK's checks also run on Guzzle 7, which many apps still use", async () => {
    const php = await read("php.yml");
    assert.match(php, /name: PHP 8\.2 on Guzzle 7\n\s+runs-on: ubuntu-24\.04\n\s+timeout-minutes: 15\n/);
    assert.match(php, /run: composer update "guzzlehttp\/guzzle:\^7\.9" --with-all-dependencies --no-interaction --no-progress\n\s+- run: vendor\/bin\/phpunit\n/);
});

test("the PHP SDK's checks also run on Symfony HttpClient 5.4, whose PSR-18 client takes no options", async () => {
    const php = await read("php.yml");
    assert.match(php, /name: PHP 8\.2 on Symfony HttpClient 5\.4\n\s+runs-on: ubuntu-24\.04\n\s+timeout-minutes: 15\n/);
    assert.match(php, /run: composer require --dev "symfony\/http-client:\^5\.4" --update-with-all-dependencies --no-interaction --no-progress\n\s+- run: vendor\/bin\/phpunit\n/);
});

test("the PHP SDK's checks also run on the lowest versions its composer.json allows", async () => {
    const php = await read("php.yml");
    assert.match(php, /name: PHP 8\.2 on the lowest dependencies\n\s+runs-on: ubuntu-24\.04\n\s+timeout-minutes: 15\n/);
    assert.match(php, /php-version: "8\.2"\n\s+coverage: none\n\s+tools: composer:v2\n\s+# composer\.json's floors/);
    assert.match(php, /run: composer update --prefer-lowest --prefer-stable --no-interaction --no-progress\n\s+- run: vendor\/bin\/phpunit\n/);
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
    assert.match(smoke, /name: Python SDK\n\s+runs-on: ubuntu-24\.04\n\s+timeout-minutes: 15\n/);
    assert.match(smoke, /working-directory: python\n/);
    assert.match(smoke, /run: uv sync --locked\n/);
    assert.match(smoke, /run: uv run pytest smoke\n\s+env:\n\s+NEURONAI_SMOKE_API_KEY: \$\{\{ secrets\.NEURONAI_SMOKE_API_KEY \}\}\n/);
});

test("the PHP SDK's smoke tests run on their own, apart from its unit tests, with the key in their step's env alone", async () => {
    const smoke = await read("smoke.yml");
    assert.match(smoke, /name: PHP SDK\n\s+runs-on: ubuntu-24\.04\n\s+timeout-minutes: 15\n/);
    assert.match(smoke, /working-directory: php\n/);
    assert.match(smoke, /php-version: "8\.5"\n\s+coverage: none\n/);
    assert.match(smoke, /run: composer install --no-interaction --no-progress\n/);
    assert.match(smoke, /run: vendor\/bin\/phpunit --testsuite smoke\n\s+env:\n\s+NEURONAI_SMOKE_API_KEY: \$\{\{ secrets\.NEURONAI_SMOKE_API_KEY \}\}\n/);
});

test("each SDK's smoke suite gets the key in its own step's env, and nothing else sees it", async () => {
    const smoke = await read("smoke.yml");
    // One mention per suite's step: never in a job's or the workflow's env, where every step would see it.
    assert.equal(smoke.match(/secrets\.NEURONAI_SMOKE_API_KEY/g)?.length, 3);
});

test("the PHP SDK's mirror pushes php/, with its history, to naiuz/sdk-php when php/ changes on main", async () => {
    const split = await read("split-php.yml");
    assert.match(split, /on:\n\s+push:\n\s+branches: \[main\]\n\s+paths:\n\s+- "php\/\*\*"\n\s+- "\.github\/workflows\/split-php\.yml"\n\s+workflow_dispatch:\n/);
    assert.doesNotMatch(split, /pull_request/);
    assert.match(split, /permissions:\n\s+contents: read\n/);
    assert.match(split, /concurrency:\n\s+group: split-php\n\s+cancel-in-progress: false\n/);
    // Run by hand from another branch, it would fast-forward the mirror's main to that branch's commits.
    assert.match(split, /mirror:\n\s+name: Mirror php\/ to naiuz\/sdk-php\n\s+if: github\.ref == 'refs\/heads\/main'\n/);
    assert.match(split, /runs-on: ubuntu-24\.04\n\s+timeout-minutes: 10\n/);
    assert.match(split, /uses: actions\/checkout@.+\n\s+if: steps\.key\.outputs\.present == 'true'\n\s+with:\n\s+fetch-depth: 0\n\s+persist-credentials: false\n/);
    assert.match(split, /run: git subtree split --prefix=php --branch=sdk-php\n/);
    // A fast-forward of main alone: never forced, and no tags until the releases add them.
    assert.match(split, /git push git@github\.com:naiuz\/sdk-php\.git sdk-php:refs\/heads\/main\n/);
    assert.doesNotMatch(split, /--force|--tags|--mirror/);
    assert.match(split, /echo "github\.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > ~\/\.ssh\/known_hosts\n/);
    assert.match(split, /StrictHostKeyChecking=yes/);
    // The key only in the two steps that need it.
    assert.equal(split.match(/secrets\.SDK_PHP_DEPLOY_KEY/g)?.length, 2);
    assert.match(split, /env:\n\s+SDK_PHP_DEPLOY_KEY: \$\{\{ secrets\.SDK_PHP_DEPLOY_KEY \}\}\n\s+SDK_PHP_MIRROR: \$\{\{ vars\.SDK_PHP_MIRROR \}\}\n/);
});

test("the PHP SDK's mirror warns without its deploy key, and fails without it once SDK_PHP_MIRROR is on", async () => {
    const split = await read("split-php.yml");
    const script = split.match(/id: key\n[\s\S]*?run: \|\n([\s\S]*?)\n {6}- uses:/)?.[1];
    assert.ok(script, "the key check's script");
    const directory = await mkdtemp(join(tmpdir(), "split-php-"));
    try {
        const check = async (key, mirror) => {
            const output = join(directory, `${key}-${mirror}`);
            const run = spawnSync("bash", ["-e", "-c", script], {env: {PATH: process.env.PATH, GITHUB_OUTPUT: output, SDK_PHP_DEPLOY_KEY: key, SDK_PHP_MIRROR: mirror}, encoding: "utf8"});
            const said = await readFile(output, "utf8").catch(() => "");
            return {status: run.status, stdout: run.stdout, said};
        };
        const missing = await check("", "");
        assert.deepEqual([missing.status, missing.said], [0, "present=false\n"]);
        assert.match(missing.stdout, /^::warning title=Mirror skipped::/);
        const expected = await check("", "on");
        assert.equal(expected.status, 1);
        assert.match(expected.stdout, /^::error title=No deploy key::/);
        const present = await check("-----BEGIN OPENSSH PRIVATE KEY-----", "on");
        assert.deepEqual([present.status, present.said, present.stdout], [0, "present=true\n", ""]);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
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
