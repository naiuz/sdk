import {defineConfig} from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    // tsup's declaration build sets baseUrl, which TypeScript 6 deprecates. This silences that for it alone.
    dts: {compilerOptions: {ignoreDeprecations: "6.0"}},
    tsconfig: "tsconfig.build.json",
    target: "es2022",
    platform: "neutral",
    sourcemap: true,
    clean: true,
    external: ["react", "@naiuz/agents", "@naiuz/agents/orb"],
});
