import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {basename} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The apostrophes the currency's name is written with: ASCII, the two quotation marks, and Uzbek's two letters. */
const APOSTROPHES = [0x27, 0x2018, 0x2019, 0x2bb, 0x2bc].map((point) => String.fromCodePoint(point));

/**
 * The unit the API priced in until 2026-10-06, in any case, and its currency's name with any apostrophe. The API
 * prices in credits now, and so does everything here: the SDKs, their docs and examples, the fixtures and the pinned
 * API document. Built from pieces, so that this file never names it.
 */
const RETIRED = new RegExp(`\\b${"UZ"}S\\b|\\bso[${APOSTROPHES.join("")}]m`, "i");

/** Lock files: their hashes are random letters, which could spell anything. */
const LOCK_FILES = new Set(["package-lock.json", "uv.lock", "composer.lock"]);

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

test("the check finds the retired unit in any case, and its currency's name with any apostrophe", () => {
    const unit = ["U", "Z", "S"].join("");
    const names = APOSTROPHES.map((apostrophe) => `# 5 so${apostrophe}m`);
    const files = new Map([
        ["README.md", `Costs 10 000 ${unit}.\nCosts 10 000 credits.\nin \`${unit.toLowerCase()}\`, per month`],
        ["example.py", [...names, "# 5 som, 5 so-m"].join("\n")],
        ["names.ts", `// Uzbek, fuzzy, ${unit}B, ${unit.toLowerCase()}m, ${unit}_RATE`],
        ["js/package-lock.json", `"integrity": "sha512-a/${unit}+b"`],
    ]);
    assert.deepEqual(retiredUnitLines(files), [
        `README.md:1: Costs 10 000 ${unit}.`,
        `README.md:3: in \`${unit.toLowerCase()}\`, per month`,
        ...names.map((name, index) => `example.py:${index + 1}: ${name}`),
    ]);
});

test("no file git tracks names the retired unit: the SDKs, the fixtures and the API document all say credits", () => {
    const paths = execFileSync("git", ["ls-files", "-z"], {cwd: ROOT, encoding: "utf8"}).split("\0").filter(Boolean);
    assert.ok(paths.length > 400, `git listed only ${paths.length} files`);
    const files = new Map(paths.map((path) => [path, readFileSync(`${ROOT}${path}`, "utf8")]));
    assert.deepEqual(retiredUnitLines(files), []);
});
