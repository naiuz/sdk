// Checks, before anything is published, that a tag is a release release-please made of one SDK: the tag's name, its
// commit on main, and the version that the manifest and the SDK's own files give at that commit. Run it from the
// repository's root, with the tag checked out and main fetched, on any Node the runner has:
//   node .github/scripts/release-check.mjs js js-v0.1.0
// It prints the version, and adds it to the step's outputs on GitHub Actions.
import {execFileSync} from "node:child_process";
import {appendFileSync, readFileSync} from "node:fs";

const OWN_VERSION = {
    js: () => JSON.parse(readFileSync("js/package.json", "utf8")).version,
    python: () => /^version = "([^"]+)"$/m.exec(readFileSync("python/pyproject.toml", "utf8"))?.[1],
    php: () => /^ {4}public const VERSION = '([^']+)';/m.exec(readFileSync("php/src/NeuronAI.php", "utf8"))?.[1],
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
if (!Object.hasOwn(OWN_VERSION, component ?? "")) refuse(`"${component}" isn't an SDK: give js, python or php.`);
const version = new RegExp(`^${component}-v(\\d+\\.\\d+\\.\\d+)$`).exec(tag ?? "")?.[1];
if (version === undefined) refuse(`"${tag}" isn't a release tag of ${component}, such as ${component}-v0.1.0.`);
const tagged = git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`);
if (tagged === null) refuse(`There is no tag ${tag}.`);
if (git("rev-parse", "HEAD") !== tagged) refuse(`The checkout isn't ${tag}.`);
if (git("merge-base", "--is-ancestor", tagged, "refs/remotes/origin/main") === null) refuse(`${tag} isn't on main.`);
const released = JSON.parse(readFileSync(".release-please-manifest.json", "utf8"))[component];
if (released !== version) refuse(`At ${tag}, .release-please-manifest.json gives ${component} ${released}, not ${version}.`);
const own = OWN_VERSION[component]();
if (own !== version) refuse(`At ${tag}, ${component}'s own version is ${own}, not ${version}.`);
console.log(version);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
