import js from "@eslint/js";
import {defineConfig} from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    {ignores: ["**/dist/"]},
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // Node scripts and examples run as they are, without TypeScript.
        files: ["eslint.config.js", "**/scripts/**/*.mjs", "**/examples/**/*.mjs"],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: {
            globals: {console: "readonly", process: "readonly", URL: "readonly", WebSocket: "readonly", setTimeout: "readonly", clearTimeout: "readonly"},
        },
    },
);
