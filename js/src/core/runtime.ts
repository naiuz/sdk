import {VERSION} from "../version";
import type {Fetch} from "./http";

// The globals each runtime may define, read without assuming any of them exists.
interface RuntimeGlobals {
    window?: {document?: unknown};
    Deno?: {version?: {deno?: string}; env?: {get?: (name: string) => string | undefined}};
    Bun?: {version?: string};
    process?: {versions?: {node?: string}; env?: Record<string, string | undefined>};
    navigator?: {userAgent?: string};
    fetch?: Fetch;
}

const globals = (): RuntimeGlobals => globalThis;

/** The global fetch, or undefined in a runtime without one. */
export function globalFetch(): Fetch | undefined {
    return globals().fetch;
}

/** Whether this code runs in a browser page, where an API key is exposed to anyone who opens it. */
export function isBrowser(): boolean {
    const {window} = globals();
    return typeof window?.document === "object" && window.document !== null;
}

/** An environment variable, trimmed; undefined when it is unset, empty, or can't be read (Deno without --allow-env). */
export function readEnv(name: string): string | undefined {
    const {Deno, process} = globals();
    try {
        const value = Deno?.env?.get?.(name) ?? process?.env?.[name];
        return value?.trim() || undefined;
    } catch {
        return undefined;
    }
}

const majorMinor = (version: string): string => version.split(".").slice(0, 2).join(".");

/** The runtime and its major.minor version, such as `Node 20.19`; `unknown` when it can't be told. */
export function runtimeName(): string {
    const {Deno, Bun, process, navigator} = globals();
    if (typeof Deno?.version?.deno === "string") return `Deno ${majorMinor(Deno.version.deno)}`;
    if (typeof Bun?.version === "string") return `Bun ${majorMinor(Bun.version)}`;
    if (typeof process?.versions?.node === "string") return `Node ${majorMinor(process.versions.node)}`;
    if (navigator?.userAgent === "Cloudflare-Workers") return "Cloudflare-Workers";
    return "unknown";
}

/** The User-Agent the SDK sends: `naiuz-js/<version> (<runtime> <major.minor>)`. */
export function userAgent(): string {
    return `naiuz-js/${VERSION} (${runtimeName()})`;
}
