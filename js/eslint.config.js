import js from "@eslint/js";
import {defineConfig} from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    {ignores: ["dist/"]},
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
        files: ["eslint.config.js"],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        // Plain JavaScript that Bun and Deno run against the built package.
        files: ["smoke/**/*.mjs"],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: {
            globals: {console: "readonly", setTimeout: "readonly", Request: "readonly", Response: "readonly", URL: "readonly"},
        },
    },
);
