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
    async verify(body: string, signature: string | null | undefined, secret: string, options: VerifyWebhookOptions = {}): Promise<WebhookEvent> {
        const {toleranceSeconds = 300, now = Date.now() / 1000} = options;
        const parts = (signature ?? "").split(",").map((part) => part.trim().split("="));
        const timestamp = parts.find(([name]) => name === "t")?.[1] ?? "";
        const signatures = parts.filter(([name]) => name === "v1").map(([, value]) => value ?? "");
        if (!/^\d+$/.test(timestamp) || signatures.length === 0) {
            throw new WebhookVerificationError("The signature header isn't one we send.");
        }
        if (Math.abs(now - Number(timestamp)) > toleranceSeconds) {
            throw new WebhookVerificationError("The signature is too old, or from the future.");
        }
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["verify"]);
        const signed = encoder.encode(`${timestamp}.${body}`);
        for (const candidate of signatures) {
            if (/^[0-9a-f]{64}$/.test(candidate) && (await crypto.subtle.verify("HMAC", key, hexToBytes(candidate), signed))) {
                return JSON.parse(body) as WebhookEvent;
            }
        }
        throw new WebhookVerificationError("The signature doesn't match the body.");
    }
}
