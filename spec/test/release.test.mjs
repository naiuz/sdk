import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const json = async (path) => JSON.parse(await read(path));

// Every place each SDK writes its own version, as release-please finds it there.
const VERSION_FILES = {
    js: {
        "js/package.json": async () => (await json("js/package.json")).version,
        "js/package-lock.json": async () => (await json("js/package-lock.json")).version,
        "js/package-lock.json, its root package": async () => (await json("js/package-lock.json")).packages[""].version,
        "js/src/version.ts": async () => /^export const VERSION = "([^"]+)"; \/\/ x-release-please-version$/m.exec(await read("js/src/version.ts"))?.[1],
    },
    python: {
        "python/pyproject.toml": async () => /^version = "([^"]+)"$/m.exec(await read("python/pyproject.toml"))?.[1],
        "python/src/naiuz/_version.py": async () => /^__version__ = "([^"]+)" {2}# x-release-please-version$/m.exec(await read("python/src/naiuz/_version.py"))?.[1],
        "python/uv.lock": async () => /^\[\[package\]\]\nname = "naiuz"\nversion = "([^"]+)"$/m.exec(await read("python/uv.lock"))?.[1],
    },
    php: {
        "php/src/NeuronAI.php": async () => /^ {4}public const VERSION = '([^']+)'; \/\/ x-release-please-version$/m.exec(await read("php/src/NeuronAI.php"))?.[1],
    },
};

test("release-please gives each SDK and agents package its own release pull request, changelog and tag, such as js-v0.1.0", async () => {
    const config = await json("release-please-config.json");
    assert.equal(config["separate-pull-requests"], true);
    assert.equal(config["include-component-in-tag"], true);
    assert.equal(config["include-v-in-tag"], true);
    const packages = Object.entries(config.packages).map(([path, options]) => [path, options["release-type"], options.component]);
    assert.deepEqual(packages, [
        ["js", "node", "js"], ["python", "python", "python"], ["php", "php", "php"],
        ["agents/protocol", "node", "agents-protocol"], ["agents/client", "node", "agents"], ["agents/vue", "node", "agents-vue"],
        ["agents/react", "node", "agents-react"], ["agents/widget", "node", "agents-widget"],
    ]);
    // Each changelog is CHANGELOG.md in the SDK's own folder, release-please's default.
    for (const options of Object.values(config.packages)) assert.equal(options["changelog-path"], undefined);
});

test("every push to main rebuilds each open release pull request on it, so one SDK's release leaves the others mergeable", async () => {
    // Otherwise a pull request whose release notes didn't change keeps the manifest it was cut from, and conflicts once
    // another SDK's release changes the line next to its own.
    const config = await json("release-please-config.json");
    assert.equal(config["always-update"], true);
});

test("each SDK's first release is 0.1.0, with a changelog of what came after the last commit before releases", async () => {
    const config = await json("release-please-config.json");
    assert.equal(config["initial-version"], "0.1.0");
    assert.equal(config["bootstrap-sha"], "db781c5072bca9f44cd401613f8ebb5b0e7b5b4a");
    const manifest = await json(".release-please-manifest.json");
    assert.deepEqual(Object.keys(manifest), ["js", "python", "php"]);
    for (const version of Object.values(manifest)) assert.match(version, /^\d+\.\d+\.\d+$/);
});

test("an agents package not yet released holds the first version, and takes its sibling's patch releases by its range", async () => {
    const config = await json("release-please-config.json");
    const manifest = await json(".release-please-manifest.json");
    const lock = await json("agents/package-lock.json");
    for (const path of ["agents/protocol", "agents/client", "agents/vue", "agents/react", "agents/widget"]) {
        const own = await json(`${path}/package.json`);
        assert.equal(own.version, manifest[path] ?? config["initial-version"], path);
        assert.equal(lock.packages[path.replace("agents/", "")].version, own.version, `${path} in agents/package-lock.json`);
    }
    // A patch release of the protocol or the client reaches the package above it without a release of its own; a
    // breaking change bumps the minor version, and the package above has to change with it anyway.
    assert.equal((await json("agents/client/package.json")).dependencies["@naiuz/agents-protocol"], "^0.1.0");
    assert.equal((await json("agents/vue/package.json")).dependencies["@naiuz/agents"], "^0.1.0");
    assert.equal((await json("agents/react/package.json")).dependencies["@naiuz/agents"], "^0.1.0");
    assert.equal(config.plugins, undefined);
});

test("a release of an agents package moves its version in the workspace's lock too", async () => {
    const config = await json("release-please-config.json");
    for (const [path, folder] of [["agents/protocol", "protocol"], ["agents/client", "client"], ["agents/vue", "vue"], ["agents/react", "react"], ["agents/widget", "widget"]]) {
        // A path from the repository's root, since the lock sits above the package's folder.
        assert.deepEqual(
            config.packages[path]["extra-files"],
            [{type: "json", path: "/agents/package-lock.json", jsonpath: `$.packages.${folder}.version`}],
            path,
        );
    }
});

test("below 1.0.0, a breaking change bumps an SDK's minor version and anything else its patch, as ^0.1.0 ranges expect", async () => {
    const config = await json("release-please-config.json");
    assert.equal(config["bump-minor-pre-major"], true);
    assert.equal(config["bump-patch-for-minor-pre-major"], true);
});

test("a changelog lists features, fixes, performance work and reverts, and leaves the rest out", async () => {
    const config = await json("release-please-config.json");
    const listed = config["changelog-sections"].filter((section) => section.hidden !== true).map((section) => section.type);
    assert.deepEqual(listed, ["feat", "fix", "perf", "revert"]);
});

test("every place an SDK writes its version holds the version the manifest gives that SDK", async () => {
    const manifest = await json(".release-please-manifest.json");
    for (const [component, files] of Object.entries(VERSION_FILES)) {
        for (const [where, version] of Object.entries(files)) assert.equal(await version(), manifest[component], where);
    }
});

test("release-please updates every one of those places when it releases", async () => {
    const config = await json("release-please-config.json");
    // package.json, package-lock.json and pyproject.toml it updates itself. The others are extra files, each marked
    // x-release-please-version on its version line, which the test above reads; uv.lock it edits as TOML.
    assert.deepEqual(config.packages.js["extra-files"], ["src/version.ts"]);
    assert.deepEqual(config.packages.python["extra-files"], ["src/naiuz/_version.py", {type: "toml", path: "uv.lock", jsonpath: "$.package[?(@.name.value=='naiuz')].version"}]);
    assert.deepEqual(config.packages.php["extra-files"], ["src/NeuronAI.php"]);
});
