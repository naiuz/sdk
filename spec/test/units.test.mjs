import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, join} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The apostrophes the currency's name is written with: ASCII, the two quotation marks, Uzbek's two letters, and the
 * backtick and the acute that keyboards put in their place.
 */
const APOSTROPHES = [0x27, 0x2018, 0x2019, 0x2bb, 0x2bc, 0x60, 0xb4].map((point) => String.fromCodePoint(point));

/**
 * The unit the API priced in until 2026-10-06, in any case, as a word or beside an underscore in a name, and its
 * currency's name in any spelling. The API prices in credits now, and so does everything here: the SDKs, their docs
 * and examples, the fixtures and the pinned API document. Built from pieces, so that this file never names it.
 */
const RETIRED = new RegExp(
    `\\b${"UZ"}S\\b|\\b${"UZ"}S_|_${"UZ"}S\\b|\\bso[${APOSTROPHES.join("")}]m|\\b${"so"}ums?\\b`,
    "i",
);

/** Lock files: their hashes are random letters, which could spell anything. */
const LOCK_FILES = new Set(["package-lock.json", "uv.lock", "composer.lock"]);

/**
 * The text of each of `paths` under `root`, leaving out a file that is gone and one git would call binary, with a NUL
 * in its first 8000 bytes: random bytes could spell anything.
 */
function trackedTexts(root, paths) {
    const texts = new Map();
    for (const path of paths) {
        let bytes;
        try {
            bytes = readFileSync(`${root}${path}`);
        } catch (error) {
            if (error.code === "ENOENT") continue;
            throw error;
        }
        if (bytes.subarray(0, 8000).includes(0)) continue;
        texts.set(path, bytes.toString("utf8"));
    }
    return texts;
}

/** Each line of `files` (path to text) that names the retired unit, as `path:line: text`. */
function retiredUnitLines(files) {
    const found = [];
    for (const [path, text] of files) {
        if (LOCK_FILES.has(basename(path))) continue;
        text.split("\n").forEach((line, index) => {
            if (RETIRED.test(line)) found.push(`${path}:${index + 1}: ${line.trim()}`);
        });
    }
    return found;
}

test("the check finds the retired unit in any case and inside names, and its currency's name in every spelling", () => {
    const unit = ["U", "Z", "S"].join("");
    const lower = unit.toLowerCase();
    // ASCII, the two quotation marks, Uzbek's two letters, the backtick keyboards type in their place, and the acute.
    const marks = [0x27, 0x2018, 0x2019, 0x2bb, 0x2bc, 0x60, 0xb4].map((point) => String.fromCodePoint(point));
    const names = [...marks.map((mark) => `# 5 so${mark}m`), `# 5 ${"so"}um`, `# 5 ${"so"}ums`];
    const files = new Map([
        ["README.md", `Costs 10 000 ${unit}.\nCosts 10 000 credits.\nin \`${lower}\`, per month`],
        ["example.py", [...names, "# 5 som, 5 so-m, a sum"].join("\n")],
        ["names.ts", [`// Uzbek, fuzzy, ${unit}B, ${lower}m`, `const ${unit}_RATE = 1;`, `const PRICE_${unit} = 1;`, `def to_${lower}(credits):`].join("\n")],
        ["js/package-lock.json", `"integrity": "sha512-a/${unit}+b"`],
    ]);
    assert.deepEqual(retiredUnitLines(files), [
        `README.md:1: Costs 10 000 ${unit}.`,
        `README.md:3: in \`${lower}\`, per month`,
        ...names.map((name, index) => `example.py:${index + 1}: ${name}`),
        `names.ts:2: const ${unit}_RATE = 1;`,
        `names.ts:3: const PRICE_${unit} = 1;`,
        `names.ts:4: def to_${lower}(credits):`,
    ]);
});

test("the check reads the text of every tracked file, leaving out binaries and files that are gone", () => {
    const unit = ["U", "Z", "S"].join("");
    const root = `${mkdtempSync(join(tmpdir(), "units-"))}/`;
    try {
        writeFileSync(`${root}notes.md`, `Costs 10 000 ${unit}.\n`);
        // Git calls a file binary when a NUL comes in its first 8000 bytes; this one happens to spell the unit too.
        writeFileSync(`${root}clip.wav`, Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46, 0]), Buffer.from(` ${unit} `)]));
        assert.deepEqual(retiredUnitLines(trackedTexts(root, ["notes.md", "clip.wav", "gone.md"])), [`notes.md:1: Costs 10 000 ${unit}.`]);
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});

test("no file git tracks names the retired unit: the SDKs, the fixtures and the API document all say credits", () => {
    const paths = execFileSync("git", ["ls-files", "-z"], {cwd: ROOT, encoding: "utf8"}).split("\0").filter(Boolean);
    assert.ok(paths.length > 400, `git listed only ${paths.length} files`);
    assert.deepEqual(
        retiredUnitLines(trackedTexts(ROOT, paths)),
        [],
        "The API prices in credits: say credits there. A CHANGELOG.md line is a commit subject that release-please " +
            "copied: name credits in later subjects, and to clear one already in a release pull request, edit that " +
            "CHANGELOG.md on its branch and merge it before the next push to main rewrites the branch.",
    );
});
