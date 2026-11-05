import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

export default defineConfig({
    resolve: {
        // The client's source, so the hook and the client's test fakes share one Conversation.
        alias: {
            "@naiuz/agents/orb": fileURLToPath(new URL("../client/src/orb/index.ts", import.meta.url)),
            "@naiuz/agents": fileURLToPath(new URL("../client/src/index.ts", import.meta.url)),
        },
    },
    test: {
        include: ["test/**/*.test.ts"],
        environment: "node",
        restoreMocks: true,
        unstubGlobals: true,
    },
});
