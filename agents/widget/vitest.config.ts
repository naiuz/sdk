import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

export default defineConfig({
    oxc: {jsx: {runtime: "classic", pragma: "h", pragmaFrag: "Fragment"}},
    resolve: {
        alias: {
            "@naiuz/agents/orb": fileURLToPath(new URL("../client/src/orb/index.ts", import.meta.url)),
            "@naiuz/agents-vue": fileURLToPath(new URL("../vue/src/index.ts", import.meta.url)),
            "@naiuz/agents": fileURLToPath(new URL("../client/src/index.ts", import.meta.url)),
        },
    },
    test: {
        include: ["test/**/*.test.{ts,tsx}"],
        environment: "node",
        restoreMocks: true,
        unstubGlobals: true,
    },
});
