import {NeuronAIError} from "../errors";

/** A query parameter's value. Undefined and null are left out of the URL. */
export type QueryValue = string | number | boolean | null | undefined;

/**
 * A path parameter, percent-encoded per RFC 3986: every character outside
 * the unreserved set (A-Z a-z 0-9 - . _ ~) becomes UTF-8 %XX.
 * encodeURIComponent leaves !'()* alone, so those are escaped here.
 */
export function encodePathParam(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * The URL of one call: the base URL, then the path with each `{name}`
 * replaced by its encoded parameter, then the query without undefined or
 * null values. A path parameter that is empty, "." or ".." is refused,
 * because the URL would then name another endpoint.
 */
export function buildURL(baseURL: string, path: string, pathParams: Record<string, string> = {}, query: Record<string, QueryValue> = {}): string {
    const filled = path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
        const value: unknown = pathParams[name];
        if (typeof value !== "string" || value === "" || value === "." || value === "..") {
            throw new NeuronAIError(`The path parameter "${name}" must be a non-empty string other than "." and "..".`);
        }
        return encodePathParam(value);
    });
    const url = new URL(`${baseURL.replace(/\/+$/, "")}${filled}`);
    for (const [name, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.append(name, String(value));
    }
    return url.href;
}
