import {defineConfig} from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    // tsup's declaration build sets baseUrl, which TypeScript 6 deprecates. This silences that for the declaration build only.
    dts: {compilerOptions: {ignoreDeprecations: "6.0"}},
    tsconfig: "tsconfig.build.json",
    target: "es2022",
    platform: "neutral",
    sourcemap: true,
    clean: true,
});
