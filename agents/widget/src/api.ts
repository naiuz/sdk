import type {ContactDetails, Locale, LogMessage, WidgetSettings} from "./settings";

export const DEFAULT_API_URL = "https://my.neuronai.uz";

const BASE_PATH = "/api/agents/v1";

/** What the server said no with: its code, and any field it was about. */
export class WidgetApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly fields: Record<string, string>;

    constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
        super(message);
        this.name = "WidgetApiError";
        this.status = status;
        this.code = code;
        this.fields = fields;
    }
}

export interface IssuedSession {
    token: string;
    url: string;
    voice: boolean;
    visitor_token?: string;
}

export interface MessageLog {
    messages: LogMessage[];
    has_more: boolean;
    status: string | null;
    conversation_id: string | null;
}

/** Who the element is for: a widget's key, or an agent's id alone. */
export type WidgetIdentity = {widgetKey: string; agentId?: undefined} | {agentId: string; widgetKey?: undefined};

/** What a widget asks of the server. A visitor's token goes in a header, as an address ends up in logs. */
export class WidgetApi {
    private readonly base: string;
    private readonly identity: WidgetIdentity;
    private readonly fetcher: typeof globalThis.fetch;

    constructor(apiUrl: string, identity: WidgetIdentity, fetcher: typeof globalThis.fetch = globalThis.fetch) {
        this.base = `${apiUrl.replace(/\/+$/, "")}${BASE_PATH}`;
        this.identity = identity;
        // Called bare: a browser's fetch throws when it's called as a method of anything else.
        this.fetcher = fetcher;
    }

    /** The widget's settings, or null where nothing could answer. */
    async settings(locale: Locale | null, visitorToken: string | null): Promise<WidgetSettings | null> {
        const path = this.identity.widgetKey === undefined ? `/agents/${this.identity.agentId}/widget` : `/widgets/${this.identity.widgetKey}`;
        const query = locale === null ? "" : `?lang=${locale}`;
        const answer = await this.call<WidgetSettings | {available: false}>("GET", `${path}${query}`, {visitorToken});
        return answer.available ? answer : null;
    }

    /** A token for a socket. A widget's key brings its visitor along; an agent's id has none. */
    session(options: {mode: "text" | "voice"; visitorToken: string | null; contact: ContactDetails; test: boolean}): Promise<IssuedSession> {
        return this.call("POST", "/sessions", {
            body:
                this.identity.widgetKey === undefined
                    ? {agent_id: this.identity.agentId, mode: options.mode}
                    : {
                          widget_key: this.identity.widgetKey,
                          mode: options.mode,
                          visitor_token: options.visitorToken,
                          contact: options.contact,
                          test: options.test,
                      },
        });
    }

    messages(visitorToken: string, position: {before?: number; after?: number} = {}): Promise<MessageLog> {
        const query = new URLSearchParams();
        if (position.before !== undefined) query.set("before", String(position.before));
        if (position.after !== undefined) query.set("after", String(position.after));
        const suffix = query.toString() === "" ? "" : `?${query.toString()}`;
        return this.call("GET", `${this.widgetPath()}/messages${suffix}`, {visitorToken});
    }

    async unread(visitorToken: string): Promise<number> {
        return (await this.call<{unread: number}>("GET", `${this.widgetPath()}/unread`, {visitorToken})).unread;
    }

    async seen(visitorToken: string): Promise<void> {
        await this.call("POST", `${this.widgetPath()}/seen`, {visitorToken});
    }

    /** Sent even when the visitor opens the widget and leaves at once. A lost count matters to no one. */
    opened(): void {
        void this.fetcher(`${this.base}${this.widgetPath()}/events`, {
            method: "POST",
            keepalive: true,
            headers: {Accept: "application/json", "Content-Type": "application/json"},
            body: JSON.stringify({type: "open"}),
        }).catch(() => undefined);
    }

    async upload(
        conversationId: string,
        resumeToken: string,
        file: File,
        options: {clientMessageId: string; caption: string | null; replyToMessageId: number | null},
    ): Promise<LogMessage> {
        const form = new FormData();
        form.set("file", file);
        form.set("client_message_id", options.clientMessageId);
        if (options.caption !== null) form.set("caption", options.caption);
        if (options.replyToMessageId !== null) form.set("reply_to_message_id", String(options.replyToMessageId));
        const answer = await this.request(`/conversations/${conversationId}/attachments`, {
            method: "POST",
            headers: {Accept: "application/json", Authorization: `Bearer ${resumeToken}`},
            body: form,
        });
        return (answer as {message: LogMessage}).message;
    }

    private widgetPath(): string {
        return `/widgets/${this.identity.widgetKey ?? ""}`;
    }

    private call<Answer>(method: string, path: string, options: {visitorToken?: string | null; body?: unknown}): Promise<Answer> {
        const {visitorToken = null, body} = options;
        return this.request(path, {
            method,
            headers: {
                Accept: "application/json",
                ...(body === undefined ? {} : {"Content-Type": "application/json"}),
                ...(visitorToken === null ? {} : {"X-Visitor-Token": visitorToken}),
            },
            ...(body === undefined ? {} : {body: JSON.stringify(body)}),
        }) as Promise<Answer>;
    }

    private async request(path: string, init: RequestInit): Promise<unknown> {
        const fetcher = this.fetcher;
        let response: Response;
        try {
            response = await fetcher(`${this.base}${path}`, init);
        } catch {
            throw new WidgetApiError(0, "unavailable", "The server couldn't be reached.");
        }
        if (response.status === 204) return undefined;
        const answer = (await response.json().catch(() => null)) as {
            data?: unknown;
            error?: {code?: unknown; message?: unknown; fields?: unknown};
        } | null;
        if (response.ok) return answer?.data;
        const error = answer?.error;
        throw new WidgetApiError(
            response.status,
            typeof error?.code === "string" ? error.code : "unavailable",
            typeof error?.message === "string" ? error.message : "The server said no.",
            error?.fields !== null && typeof error?.fields === "object" ? (error.fields as Record<string, string>) : {},
        );
    }
}
