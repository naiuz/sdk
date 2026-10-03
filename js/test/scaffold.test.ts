import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {VERSION} from "../src/index";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
    dependencies?: Record<string, string>;
    exports: Record<string, unknown>;
    repository?: unknown;
    homepage?: string;
    bugs?: unknown;
    keywords?: string[];
    publishConfig?: unknown;
};
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("the package", () => {
    it("reports the version package.json declares", () => {
        expect(VERSION).toBe(manifest.version);
    });

    it("has no runtime dependencies", () => {
        expect(manifest.dependencies ?? {}).toEqual({});
    });

    it("exports an ESM and a CommonJS build, each with its types", () => {
        expect(manifest.exports["."]).toEqual({
            import: {types: "./dist/index.d.ts", default: "./dist/index.js"},
            require: {types: "./dist/index.d.cts", default: "./dist/index.cjs"},
        });
    });

    it("names its folder of the GitHub repository, which npm checks a provenance statement against", () => {
        expect(manifest.repository).toEqual({type: "git", url: "git+https://github.com/naiuz/sdk.git", directory: "js"});
        expect(manifest.homepage).toBe("https://github.com/naiuz/sdk/tree/main/js#readme");
        expect(manifest.bugs).toEqual({url: "https://github.com/naiuz/sdk/issues"});
        expect(manifest.keywords).toContain("neuronai");
    });

    it("is published public, with provenance", () => {
        expect(manifest.publishConfig).toEqual({access: "public", provenance: true});
    });

    it("links api.md and the examples from its README by GitHub URLs, which npm's page can follow", () => {
        expect(readme).toContain("[api.md](https://github.com/naiuz/sdk/blob/main/js/api.md)");
        expect(readme).toContain("[examples/](https://github.com/naiuz/sdk/tree/main/js/examples)");
        const targets = [...readme.matchAll(/\]\(([^)]*)\)/g)].map((match) => match[1]);
        expect(targets.filter((target) => !target?.startsWith("https://"))).toEqual([]);
    });
});
