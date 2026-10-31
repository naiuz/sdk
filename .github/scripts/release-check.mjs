// Checks, before anything is published, that a tag is a release release-please made of one package, an SDK or an
// agents package: the tag's name, its commit on main, and the version that the manifest and the package's own files
// give at that commit. Run it from the
// repository's root, with the tag checked out and main fetched, on any Node the runner has:
//   node .github/scripts/release-check.mjs js js-v0.1.0
// It prints the version, and adds it to the step's outputs on GitHub Actions.
import {execFileSync} from "node:child_process";
import {appendFileSync, readFileSync} from "node:fs";

/** A package's version, from its package.json. */
const packageVersion = (folder) => () => JSON.parse(readFileSync(`${folder}/package.json`, "utf8")).version;

// Each package's folder, the key the manifest keeps its version under, and how to read its own version there.
const FOLDER = {js: "js", python: "python", php: "php", "agents-protocol": "agents/protocol", agents: "agents/client", "agents-vue": "agents/vue"};
const OWN_VERSION = {
    js: packageVersion("js"),
    python: () => /^version = "([^"]+)"$/m.exec(readFileSync("python/pyproject.toml", "utf8"))?.[1],
    php: () => /^ {4}public const VERSION = '([^']+)';/m.exec(readFileSync("php/src/NeuronAI.php", "utf8"))?.[1],
    "agents-protocol": packageVersion("agents/protocol"),
    agents: packageVersion("agents/client"),
    "agents-vue": packageVersion("agents/vue"),
};

function refuse(message) {
    console.log(`::error title=Not a release::${message}`);
    process.exit(1);
}

/** What git prints, or null when it fails. */
function git(...args) {
    try {
        return execFileSync("git", args, {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
    } catch {
        return null;
    }
}

const [component, tag] = process.argv.slice(2);
if (!Object.hasOwn(OWN_VERSION, component ?? "")) refuse(`"${component}" isn't a package this repository releases: give js, python, php, agents-protocol, agents or agents-vue.`);
const version = new RegExp(`^${component}-v(\\d+\\.\\d+\\.\\d+)$`).exec(tag ?? "")?.[1];
if (version === undefined) refuse(`"${tag}" isn't a release tag of ${component}, such as ${component}-v0.1.0.`);
const tagged = git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`);
if (tagged === null) refuse(`There is no tag ${tag}.`);
if (git("rev-parse", "HEAD") !== tagged) refuse(`The checkout isn't ${tag}.`);
if (git("merge-base", "--is-ancestor", tagged, "refs/remotes/origin/main") === null) refuse(`${tag} isn't on main.`);
const released = JSON.parse(readFileSync(".release-please-manifest.json", "utf8"))[FOLDER[component]];
if (released !== version) refuse(`At ${tag}, .release-please-manifest.json gives ${component} ${released}, not ${version}.`);
// The release is the commit that moved the manifest to this version: a later commit tagged by hand gives it too.
const before = git("show", `${tagged}^:.release-please-manifest.json`);
if (before !== null && JSON.parse(before)[FOLDER[component]] === version) refuse(`${tag} isn't the commit that released ${component} ${version}: its parent gives that version already.`);
const own = OWN_VERSION[component]();
if (own !== version) refuse(`At ${tag}, ${component}'s own version is ${own}, not ${version}.`);
console.log(version);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
