import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

export default defineConfig({
    resolve: {
        // The client's source, so the composable and the client's test fakes share one Conversation.
        alias: {"@naiuz/agents": fileURLToPath(new URL("../client/src/index.ts", import.meta.url))},
    },
    test: {
        include: ["test/**/*.test.ts"],
        environment: "node",
        restoreMocks: true,
        unstubGlobals: true,
    },
});
