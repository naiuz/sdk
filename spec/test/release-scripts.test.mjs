import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const releaseCheck = fileURLToPath(new URL("../../.github/scripts/release-check.mjs", import.meta.url));
const tagPhpMirror = fileURLToPath(new URL("../../.github/scripts/tag-php-mirror.sh", import.meta.url));

// Git as the scripts meet it on a runner: no user or system config of the machine running the tests.
const ENV = {
    PATH: process.env.PATH,
    HOME: tmpdir(),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "release",
    GIT_AUTHOR_EMAIL: "release",
    GIT_COMMITTER_NAME: "release",
    GIT_COMMITTER_EMAIL: "release",
};

function run(cwd, command, ...args) {
    const result = spawnSync(command, args, {cwd, env: ENV, encoding: "utf8"});
    return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

function git(cwd, ...args) {
    const result = run(cwd, "git", ...args);
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
}

async function commit(repo, files, message) {
    for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(repo, path)), {recursive: true});
        await writeFile(join(repo, path), content);
    }
    git(repo, "add", "--all");
    git(repo, "commit", "--quiet", "--message", message);
    return git(repo, "rev-parse", "HEAD");
}

async function withDirectory(use) {
    const directory = await mkdtemp(join(tmpdir(), "release-scripts-"));
    try {
        await use(directory);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
}

/** The version files of the three SDKs, as release-please writes them. */
function versions({manifest, js = manifest.js, python = manifest.python, php = manifest.php}) {
    return {
        ".release-please-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
        "js/package.json": `${JSON.stringify({name: "@naiuz/sdk", version: js}, null, 2)}\n`,
        "python/pyproject.toml": `[project]\nname = "naiuz"\nversion = "${python}"\n`,
        "php/src/NeuronAI.php": `<?php\n\nfinal readonly class NeuronAI\n{\n    public const VERSION = '${php}'; // x-release-please-version\n}\n`,
    };
}

test("the release check passes a tag release-please made of an SDK on main, and gives its version", async () => {
    await withDirectory(async (directory) => {
        const origin = join(directory, "origin");
        git(directory, "init", "--quiet", "--initial-branch=main", origin);
        await commit(origin, versions({manifest: {js: "0.1.0", python: "0.1.0", php: "0.1.0"}}), "chore(main): release js 0.1.0");
        for (const tag of ["js-v0.1.0", "python-v0.1.0", "php-v0.1.0"]) git(origin, "tag", tag);
        const clone = join(directory, "clone");
        git(directory, "clone", "--quiet", origin, clone);
        for (const component of ["js", "python", "php"]) {
            git(clone, "checkout", "--quiet", `${component}-v0.1.0`);
            const outputs = join(directory, `outputs-${component}`);
            const result = spawnSync(process.execPath, [releaseCheck, component, `${component}-v0.1.0`], {cwd: clone, env: {...ENV, GITHUB_OUTPUT: outputs}, encoding: "utf8"});
            assert.deepEqual([result.status, result.stdout], [0, "0.1.0\n"], result.stdout);
            assert.equal(await readFile(outputs, "utf8"), "version=0.1.0\n");
        }
    });
});

test("the release check refuses anything else, before anything is published", async () => {
    await withDirectory(async (directory) => {
        const origin = join(directory, "origin");
        git(directory, "init", "--quiet", "--initial-branch=main", origin);
        await commit(origin, versions({manifest: {js: "0.1.0", python: "0.0.0", php: "0.1.0"}, php: "0.0.0"}), "chore(main): release js 0.1.0");
        git(origin, "tag", "js-v0.1.0");
        git(origin, "tag", "php-v0.1.0");
        await commit(origin, versions({manifest: {js: "0.1.0", python: "0.0.0", php: "0.1.0"}, js: "0.3.0"}), "fix: a commit tagged by hand");
        git(origin, "tag", "js-v0.3.0");
        git(origin, "checkout", "--quiet", "-b", "elsewhere");
        await commit(origin, versions({manifest: {js: "0.2.0", python: "0.0.0", php: "0.1.0"}}), "chore(elsewhere): release js 0.2.0");
        git(origin, "tag", "js-v0.2.0");
        git(origin, "checkout", "--quiet", "main");
        // A release commit, then a later one tagged by hand with its version, as a release made in GitHub's UI from
        // the head of main would be: the version matches everywhere, but the commit isn't the release.
        await commit(origin, versions({manifest: {js: "0.4.0", python: "0.0.0", php: "0.1.0"}}), "chore(main): release js 0.4.0");
        await commit(origin, {...versions({manifest: {js: "0.4.0", python: "0.0.0", php: "0.1.0"}}), "js/src/fix.ts": "// a fix\n"}, "fix: a later commit tagged by hand with the release's version");
        git(origin, "tag", "js-v0.4.0");
        const clone = join(directory, "clone");
        git(directory, "clone", "--quiet", origin, clone);
        const refusals = [
            ["js-v0.1.0", "ruby", "ruby-v0.1.0", '"ruby" isn\'t an SDK: give js, python or php.'],
            ["js-v0.1.0", "js", "python-v0.1.0", '"python-v0.1.0" isn\'t a release tag of js, such as js-v0.1.0.'],
            ["js-v0.1.0", "js", "js-v0.1", '"js-v0.1" isn\'t a release tag of js, such as js-v0.1.0.'],
            ["js-v0.1.0", "js", "js-v0.1.0; rm -rf ~", '"js-v0.1.0; rm -rf ~" isn\'t a release tag of js, such as js-v0.1.0.'],
            ["js-v0.1.0", "js", "js-v9.9.9", "There is no tag js-v9.9.9."],
            ["js-v0.3.0", "js", "js-v0.1.0", "The checkout isn't js-v0.1.0."],
            ["js-v0.2.0", "js", "js-v0.2.0", "js-v0.2.0 isn't on main."],
            ["js-v0.3.0", "js", "js-v0.3.0", "At js-v0.3.0, .release-please-manifest.json gives js 0.1.0, not 0.3.0."],
            ["php-v0.1.0", "php", "php-v0.1.0", "At php-v0.1.0, php's own version is 0.0.0, not 0.1.0."],
            ["js-v0.4.0", "js", "js-v0.4.0", "js-v0.4.0 isn't the commit that released js 0.4.0: its parent gives that version already."],
        ];
        for (const [checkout, component, tag, why] of refusals) {
            git(clone, "checkout", "--quiet", checkout);
            const result = run(clone, process.execPath, releaseCheck, component, tag);
            assert.deepEqual([result.status, result.stdout], [1, `::error title=Not a release::${why}\n`], `${component} ${tag}`);
        }
    });
});

/** A repository whose php/ has three commits, the second tagged php-v0.1.0, and a clone of it, where the script runs. */
async function sdkWithPhpRelease(directory) {
    const origin = join(directory, "origin");
    git(directory, "init", "--quiet", "--initial-branch=main", origin);
    const first = await commit(origin, {"php/composer.json": "{}\n", "js/package.json": "{}\n"}, "feat: the first");
    const released = await commit(origin, {"php/CHANGELOG.md": "# Changelog\n"}, "chore(main): release php 0.1.0");
    git(origin, "tag", "php-v0.1.0");
    git(origin, "tag", "js-v0.1.0");
    const later = await commit(origin, {"php/README.md": "# NeuronAI PHP SDK\n"}, "docs: a later commit");
    const clone = join(directory, "clone");
    git(directory, "clone", "--quiet", origin, clone);
    const split = (commit) => git(clone, "subtree", "split", "--prefix=php", commit);
    return {clone, splits: {first: split(first), released: split(released), later: split(later)}};
}

/** A bare mirror whose refs are the given commits of the clone's split history. */
async function mirrorWith(directory, clone, refs) {
    const mirror = await mkdtemp(join(directory, "mirror-"));
    git(mirror, "init", "--quiet", "--bare");
    for (const [ref, commit] of Object.entries(refs)) git(clone, "push", "--quiet", mirror, `${commit}:${ref}`);
    return mirror;
}

function refsOf(mirror) {
    return Object.fromEntries(git(mirror, "for-each-ref", "--format=%(refname) %(objectname)").split("\n").filter(Boolean).map((line) => line.split(" ")));
}

test("the mirror gets php/ at a release tag as vX.Y.Z, whether its main is behind the release or ahead of it", async () => {
    await withDirectory(async (directory) => {
        const {clone, splits} = await sdkWithPhpRelease(directory);
        for (const main of [splits.first, splits.released, splits.later]) {
            const mirror = await mirrorWith(directory, clone, {"refs/heads/main": main});
            const pushed = run(clone, "bash", tagPhpMirror, mirror, "php-v0.1.0", "v0.1.0");
            assert.equal(pushed.status, 0, pushed.stderr);
            assert.equal(pushed.stdout, `Pushed v0.1.0, php/ at php-v0.1.0 (${splits.released}), to the mirror.\n`);
            // Only that tag: not the release's own tags, and main is left as it was.
            assert.deepEqual(refsOf(mirror), {"refs/heads/main": main, "refs/tags/v0.1.0": splits.released});
            const again = run(clone, "bash", tagPhpMirror, mirror, "php-v0.1.0", "v0.1.0");
            assert.deepEqual([again.status, again.stdout], [0, `The mirror's v0.1.0 already names php/ at php-v0.1.0 (${splits.released}).\n`]);
        }
    });
});

test("the mirror's tag is never moved or forced, and nothing is pushed beside a main someone else pushed", async () => {
    await withDirectory(async (directory) => {
        const {clone, splits} = await sdkWithPhpRelease(directory);
        const taken = await mirrorWith(directory, clone, {"refs/heads/main": splits.later, "refs/tags/v0.1.0": splits.first});
        const refused = run(clone, "bash", tagPhpMirror, taken, "php-v0.1.0", "v0.1.0");
        assert.deepEqual([refused.status, refused.stdout], [1, `::error title=Tag taken::The mirror's v0.1.0 names ${splits.first}, not php/ at php-v0.1.0 (${splits.released}), and is left as it is.\n`]);
        assert.equal(refsOf(taken)["refs/tags/v0.1.0"], splits.first);

        const stranger = join(directory, "stranger");
        git(directory, "init", "--quiet", "--initial-branch=main", stranger);
        const pushedByHand = await commit(stranger, {"composer.json": "{}\n"}, "a commit pushed to the mirror by hand");
        const diverged = await mkdtemp(join(directory, "mirror-"));
        git(diverged, "init", "--quiet", "--bare");
        git(stranger, "push", "--quiet", diverged, "main");
        const beside = run(clone, "bash", tagPhpMirror, diverged, "php-v0.1.0", "v0.1.0");
        assert.deepEqual([beside.status, beside.stdout], [1, `::error title=Mirror diverged::The mirror's main (${pushedByHand}) isn't on the line of php/ at php-v0.1.0 (${splits.released}), so v0.1.0 isn't pushed.\n`]);
        assert.deepEqual(refsOf(diverged), {"refs/heads/main": pushedByHand});
    });
});
