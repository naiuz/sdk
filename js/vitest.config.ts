import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
        environment: "node",
        // A developer's own NEURONAI_* variables must not reach the tests.
        env: {NEURONAI_API_KEY: "", NEURONAI_BASE_URL: ""},
        restoreMocks: true,
        unstubEnvs: true,
        unstubGlobals: true,
    },
});
