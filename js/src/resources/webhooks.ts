import {isRecord} from "../core/json";
import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {requestPage, type PagePromise} from "../core/pagination";
import {readEnvelope, readNoContent, type WithRequestId} from "../core/parse";
import {WebhookVerificationError} from "../errors";
import type {CreateWebhookEndpointRequest, CreatedWebhookEndpoint, UpdateWebhookEndpointRequest, WebhookEndpoint, WebhookEvent} from "../types/webhooks";

/** What `webhooks.verify` can be told. */
export interface VerifyWebhookOptions {
    /** How old a signature may be, in seconds (300 by default). */
    toleranceSeconds?: number;
    /** The time to check it against, in seconds since the epoch. Now by default. */
    now?: number;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index++) {
        bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

/** The addresses that hear of what agents and operators say. */
/** The event in a body whose signature checked out. */
function readEvent(bytes: Uint8Array): WebhookEvent {
    let event: unknown;
    try {
        event = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        event = null;
    }
    if (!isRecord(event) || typeof event.id !== "string" || typeof event.type !== "string" || typeof event.created_at !== "string" || !isRecord(event.data)) {
        throw new WebhookVerificationError("The signed body isn't an event.");
    }
    return event as unknown as WebhookEvent;
}

export class Webhooks {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** Your organization's endpoints. A signing secret never appears here. */
    list(options?: RequestOptions): PagePromise<WebhookEndpoint> {
        return requestPage<WebhookEndpoint>(this.#http, {method: "GET", path: "/webhooks", retry: "safe", options});
    }

    /** One endpoint, and how its last delivery went. */
    retrieve(endpoint: string, options?: RequestOptions): APIPromise<WithRequestId<WebhookEndpoint>> {
        return this.#http.request({method: "GET", path: "/webhooks/{endpoint}", pathParams: {endpoint}, retry: "safe", options}, readEnvelope<WebhookEndpoint>);
    }

    /** Adds an address to send events to, and returns its signing `secret`: the only time it's shown, so store it now. For owners and admins. */
    create(params: CreateWebhookEndpointRequest, options?: RequestOptions): APIPromise<WithRequestId<CreatedWebhookEndpoint>> {
        return this.#http.request({method: "POST", path: "/webhooks", body: params, retry: "once", options}, readEnvelope<CreatedWebhookEndpoint>);
    }

    /** Changes the address or the events, or turns it off and on. Only what you pass is sent. */
    update(endpoint: string, params: UpdateWebhookEndpointRequest = {}, options?: RequestOptions): APIPromise<WithRequestId<WebhookEndpoint>> {
        return this.#http.request({method: "PATCH", path: "/webhooks/{endpoint}", pathParams: {endpoint}, body: params, retry: "safe", options}, readEnvelope<WebhookEndpoint>);
    }

    /** Deletes an endpoint, with its deliveries. */
    delete(endpoint: string, options?: RequestOptions): APIPromise<void> {
        return this.#http.request({method: "DELETE", path: "/webhooks/{endpoint}", pathParams: {endpoint}, retry: "safe", options}, readNoContent);
    }

    /**
     * Checks a webhook's `X-NeuronAI-Signature` header against the body exactly
     * as it arrived, before it's parsed, and resolves with the event. Anything
     * wrong rejects with WebhookVerificationError: answer 400 and do nothing
     * with the body. A signature older than `toleranceSeconds` (300 by default)
     * is refused, so a recorded delivery can't be played back later.
     */
    async verify(body: string | Uint8Array, signature: string | null | undefined, secret: string, options: VerifyWebhookOptions = {}): Promise<WebhookEvent> {
        const {toleranceSeconds = 300, now = Date.now() / 1000} = options;
        if (secret === "") {
            throw new WebhookVerificationError("There's no signing secret to check against.");
        }
        const parts = (signature ?? "").split(",").map((part) => {
            const equals = part.indexOf("=");
            return equals === -1 ? [part.trim(), ""] : [part.slice(0, equals).trim(), part.slice(equals + 1).trim()];
        });
        const timestamps = parts.filter(([name]) => name === "t").map(([, value]) => value ?? "");
        const signatures = parts.filter(([name]) => name === "v1").map(([, value]) => value ?? "");
        const timestamp = timestamps[0] ?? "";
        if (timestamps.length !== 1 || !/^\d{1,20}$/.test(timestamp) || signatures.length === 0) {
            throw new WebhookVerificationError("The signature header isn't one we send.");
        }
        if (Math.abs(now - Number(timestamp)) > toleranceSeconds) {
            throw new WebhookVerificationError("The signature is too old, or from the future.");
        }
        const encoder = new TextEncoder();
        const bytes = typeof body === "string" ? encoder.encode(body) : body;
        const prefix = encoder.encode(`${timestamp}.`);
        const signed = new Uint8Array(prefix.length + bytes.length);
        signed.set(prefix);
        signed.set(bytes, prefix.length);
        const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["verify"]);
        for (const candidate of signatures) {
            if (/^[0-9a-f]{64}$/.test(candidate) && (await crypto.subtle.verify("HMAC", key, hexToBytes(candidate), signed))) {
                return readEvent(bytes);
            }
        }
        throw new WebhookVerificationError("The signature doesn't match the body.");
    }
}
