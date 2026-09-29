import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        include: ["smoke/**/*.test.ts"],
        environment: "node",
        // Live calls: a synthesis job alone can take a minute or two.
        testTimeout: 180_000,
    },
});
