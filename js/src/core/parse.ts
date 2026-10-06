import {APIConnectionError, makeAPIError} from "../errors";
import type {Attempt} from "./http";
import {isRecord} from "./json";
import {rootMessage} from "./root-message";

/** An object from an `{data, request_id}` answer, with the request's ID attached. */
export type WithRequestId<T> = T & {
    /**
     * The request's ID, to quote to support: the answer's `request_id`, else
     * its `X-Request-Id` header, else `null`. It is not enumerable, so the
     * object spreads, serializes and compares exactly as the API sent it.
     */
    readonly request_id: string | null;
};

/** A compatible endpoint's body, with its price attached when the answer has an `X-Cost` header. */
export type WithCost<T> = T & {
    /**
     * The price billed, in credits, from the `X-Cost` header; absent when
     * the answer has none. It is not enumerable, so the body serializes
     * exactly as the API sent it.
     */
    readonly cost?: number;
};

function attach<T extends object, K extends string, V>(target: T, key: K, value: V): T & Readonly<Record<K, V>> {
    Object.defineProperty(target, key, {value, enumerable: false, writable: false, configurable: true});
    return target as T & Readonly<Record<K, V>>;
}

/** The error for a connection that failed while an answer's body arrived, saying what failed. */
export function connectionLost(cause: unknown): APIConnectionError {
    const reason = rootMessage(cause);
    return new APIConnectionError(reason === "" ? "The connection failed while the response arrived." : `The connection failed while the response arrived: ${reason}`, {cause});
}

/** The body as text. A connection that fails while the body arrives raises APIConnectionError. */
export async function readText(response: Response): Promise<string> {
    try {
        return await response.text();
    } catch (cause) {
        throw connectionLost(cause);
    }
}

/** The body as bytes. A connection that fails while the body arrives raises APIConnectionError. */
export async function readBytes(response: Response): Promise<Uint8Array> {
    try {
        return new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
        throw connectionLost(cause);
    }
}

/**
 * The JSON object a success answer carries. A body that isn't a JSON object,
 * or fails `valid`, raises APIError with the answer's status and the start
 * of the body, with the API key redacted from it.
 */
export async function readJsonObject(response: Response, attempt: Attempt, valid: (body: Record<string, unknown>) => boolean = () => true): Promise<Record<string, unknown>> {
    const text = await readText(response);
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        // Not JSON: raised below, like any other body the SDK can't use.
    }
    if (!isRecord(body) || !valid(body)) throw makeAPIError(response.status, response.statusText, response.headers, attempt.redact(text));
    return body;
}

/** The request's ID: the body's `request_id`, else the `X-Request-Id` header, else null. */
export function requestIdOf(body: Record<string, unknown>, headers: Headers): string | null {
    return typeof body.request_id === "string" ? body.request_id : headers.get("x-request-id");
}

/** A header as a number, or null when it is absent or not a number. */
export function numberHeader(headers: Headers, name: string): number | null {
    const text = headers.get(name)?.trim();
    if (text === undefined || text === "") return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
}

/** An `{data, request_id}` answer: its `data` object, with `request_id` attached. */
export async function readEnvelope<T extends object>(response: Response, attempt: Attempt): Promise<WithRequestId<T>> {
    const body = await readJsonObject(response, attempt, (candidate) => isRecord(candidate.data));
    return attach(body.data as T, "request_id", requestIdOf(body, response.headers));
}

/** A compatible endpoint's answer: the body as it is, with `cost` attached from `X-Cost` when sent. */
export async function readBody<T extends object>(response: Response, attempt: Attempt): Promise<WithCost<T>> {
    const body = (await readJsonObject(response, attempt)) as T;
    const cost = numberHeader(response.headers, "x-cost");
    return cost === null ? body : attach(body, "cost", cost);
}

/** A 204 answer: nothing. */
export async function readNoContent(response: Response): Promise<void> {
    await response.body?.cancel();
}
