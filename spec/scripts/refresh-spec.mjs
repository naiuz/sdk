#!/usr/bin/env node
import {readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describeDrift, formatDrift, sameDocument, toPinnedText} from "./lib/normalize.mjs";

export const LIVE_URL = "https://my.neuronai.uz/docs/api.json";
export const PINNED_PATH = fileURLToPath(new URL("../openapi.json", import.meta.url));

/** Fetches and parses the live document. Throws a message a person can act on. */
export async function fetchLiveDocument(url, fetchImpl = fetch) {
    let response;
    try {
        response = await fetchImpl(url, {headers: {accept: "application/json"}, signal: AbortSignal.timeout(30_000)});
    } catch (error) {
        const cause = error.cause?.message ? ` (${error.cause.message})` : "";
        throw new Error(`Could not reach ${url}: ${error.message}${cause}`);
    }
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    let document;
    try {
        document = JSON.parse(await response.text());
    } catch {
        throw new Error(`${url} did not return JSON`);
    }
    if (typeof document?.openapi !== "string" || typeof document?.paths !== "object" || document.paths === null) {
        throw new Error(`${url} did not return an OpenAPI document`);
    }
    return document;
}

/**
 * Pins the live document (write mode) or compares the pinned one with it
 * (check mode). Resolves to 0 when it pinned or found no drift, and to 1 on
 * drift. Rejects when the live document can't be had, before touching the
 * pinned file.
 */
export async function run({check, url = LIVE_URL, pinnedPath = PINNED_PATH, fetchImpl = fetch, log = console.log}) {
    const live = await fetchLiveDocument(url, fetchImpl);
    if (!check) {
        await writeFile(pinnedPath, toPinnedText(live));
        log(`Pinned ${url} to ${pinnedPath}.`);
        return 0;
    }
    const pinned = JSON.parse(await readFile(pinnedPath, "utf8"));
    if (sameDocument(pinned, live)) {
        log("No drift: the live document matches spec/openapi.json.");
        return 0;
    }
    log(formatDrift(describeDrift(pinned, live)));
    return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    run({check: process.argv.includes("--check")}).then(
        (code) => process.exit(code),
        (error) => {
            console.error(error.message);
            process.exit(2);
        },
    );
}
