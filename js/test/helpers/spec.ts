import {readFileSync} from "node:fs";

/** The repo's spec/ directory: the contract the SDK is tested against. */
export const SPEC_DIR = new URL("../../../spec/", import.meta.url);

/** A JSON file under spec/, parsed. */
export function readSpec(path: string): unknown {
    return JSON.parse(readFileSync(new URL(path, SPEC_DIR), "utf8"));
}
