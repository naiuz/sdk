import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {VERSION} from "../src/index";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
    dependencies?: Record<string, string>;
    exports: Record<string, unknown>;
};

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
});
