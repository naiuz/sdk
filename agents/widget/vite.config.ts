import {defineConfig} from "vite";

/**
 * Two builds of the same element, Vue and all inside. dist/widget.js is one script for a page to load, whatever it runs
 * on, and dist/index.js is for a bundler to import.
 */
export default defineConfig(({mode}) => {
    const module = mode === "module";
    return {
        oxc: {jsx: {runtime: "classic", pragma: "h", pragmaFrag: "Fragment"}},
        define: {
            "process.env.NODE_ENV": JSON.stringify("production"),
            __VUE_OPTIONS_API__: "false",
            __VUE_PROD_DEVTOOLS__: "false",
            __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
        },
        build: {
            emptyOutDir: !module,
            target: "es2020",
            minify: true,
            lib: {
                entry: "src/index.ts",
                formats: [module ? "es" : "iife"],
                name: "NeuronAIAgentWidget",
                fileName: () => (module ? "index.js" : "widget.js"),
            },
        },
    };
});
