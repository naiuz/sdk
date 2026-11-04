/** A channel an agent answers on. */
export interface AgentChannel {
    /** The channel's id. */
    id: number;
    /** `telegram`, `instagram`, `facebook`, `widget` or `voice`. */
    type: string;
    /** The channel's name. */
    name: string;
}

/** An agent. `revision` and `config` come with `retrieve`. */
export interface Agent {
    /** The agent's id, `agent_…`. */
    id: string;
    /** The agent's name. */
    name: string;
    /** `draft`, `published` or `paused`. */
    state: string;
    /** The version customers meet, or `null` before the first publish. */
    live_version: number | null;
    /** Whether the draft says something the live version doesn't. */
    has_unpublished_changes: boolean;
    /** The draft's languages, the main one first. */
    languages: string[];
    /** When it was last published. */
    last_published_at: string | null;
    /** Where it answers. */
    channels: AgentChannel[];
    /** The draft's revision, to change it from. */
    revision?: number;
    /** The draft: its prompt, languages, tools and the rest. */
    config?: Record<string, unknown>;
}

/** A new agent. */
export interface CreatedAgent {
    /** The agent's id, `agent_…`. */
    id: string;
    /** Whether the model fitted the prompt to your answers. `false` keeps the template's prompt. */
    personalized: boolean;
}

/** A saved draft. */
export interface AgentDraftSaved {
    /** The draft's new revision. */
    revision: number;
    /** When it was saved. */
    saved_at: string;
    /** Whether the draft says something the live version doesn't. */
    has_unpublished_changes: boolean;
}

/** An agent after publishing. */
export interface AgentStatus {
    /** `draft`, `published` or `paused`. */
    state: string;
    /** The version customers meet. */
    live_version: number | null;
    /** The draft's revision. */
    revision: number;
    /** Whether the draft says something the live version doesn't. */
    has_unpublished_changes: boolean;
}

/** A link a page opens a conversation with. */
export interface AgentSignedUrl {
    /** The link, for the page's `signedUrl`. It works once. */
    signed_url: string;
    /** When it stops working, 15 minutes on. */
    expires_at: string;
}

/** What `listAgents` takes. */
export interface ListAgentsParams {
    /** Part of the agent's name. */
    search?: string | null;
    /** `draft`, `published` or `paused`. */
    status?: string | null;
    /** How many, from 1 to 100 (50 when left out). */
    limit?: number | null;
    /** A page's `next_cursor`, to start from the page after it. */
    cursor?: string | null;
}

/** What `createAgent` takes. */
export interface CreateAgentRequest {
    /** The template to start from: `support`, `sales`, or `blank`, which asks nothing. */
    template: string;
    /** The agent's main language: `uz`, `ru` or `en`. */
    language: string;
    /** The agent's name. The template's when left out. */
    name?: string | null;
    /** The answers to the template's questions, by question. `support` and `sales` need `business_name`, `offering`, `goal` and `tone`, and `blank` needs none. The Agents page of the docs lists what each one takes. */
    answers?: Record<string, unknown>;
}

/** What `updateAgent` takes. */
export interface UpdateAgentRequest {
    /** The `revision` you read. */
    base_revision: number;
    /** The top-level sections of the config to replace, such as `prompt`. */
    sections: Record<string, unknown>;
}

/** What `publishAgent` takes. */
export interface PublishAgentRequest {
    /** The `revision` you read. */
    base_revision: number;
    /** What changed, for the version history. Up to 140 characters. */
    note?: string | null;
}

/** What `createAgentSignedUrl` takes. */
export interface AgentSignedUrlParams {
    /** Values for the agent's `{{variables}}` that the page can't change. They travel in the link, so they're not secret. */
    vars?: Record<string, string | number | boolean>;
    /** Your own id for this customer. Their conversations then share one contact. */
    customer_id?: string | null;
}
