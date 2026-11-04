/** How an endpoint's last delivery went. */
export interface WebhookLastDelivery {
    /** `pending`, `delivered` or `failed`. */
    status: string;
    /** The HTTP status the receiver answered. */
    status_code: number | null;
    /** When it was tried. */
    at: string;
}

/** An address that hears of events. Its secret is never here. */
export interface WebhookEndpoint {
    /** The endpoint's id, `whe_…`. */
    id: string;
    /** The address. */
    url: string;
    /** The address's host. */
    host: string;
    /** What it hears of. */
    events: string[];
    /** `active`, `disabled`, or `failing` once failures have turned it off. */
    status: string;
    /** `three_events` or `one_day` while it's `failing`. */
    failing_because: string | null;
    /** How the last delivery went. */
    last_delivery: WebhookLastDelivery | null;
    /** When it was added. */
    created_at: string;
}

/** A new endpoint, with its signing secret. */
export interface CreatedWebhookEndpoint {
    /** The endpoint. */
    endpoint: WebhookEndpoint;
    /** The signing secret: the only time it's shown, so store it now. */
    secret: string;
}

/** An event a webhook brought, once its signature is checked. */
export interface WebhookEvent {
    /** The event's id, the same on a retry or a Resend: use it to drop repeats. */
    id: string;
    /** `conversation.message.created` or `conversation.ended`, or an event added later. */
    type: string;
    /** When it happened (ISO 8601). A retry can arrive after a newer event, so sort by this. */
    created_at: string;
    /** What happened. */
    data: Record<string, unknown>;
}

/** What `createWebhookEndpoint` takes. */
export interface CreateWebhookEndpointRequest {
    /** A public https address. */
    url: string;
    /** `conversation.message.created` and `conversation.ended`. */
    events: string[];
}

/** What `updateWebhookEndpoint` takes. */
export interface UpdateWebhookEndpointRequest {
    /** A public https address. */
    url?: string;
    /** What it hears of. */
    events?: string[];
    /** On or off. Turning it on sends what was waiting. */
    enabled?: boolean;
}
