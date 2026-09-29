/**
 * How much a key may do. A `full` key holds every product at its highest
 * level, products added later included, but never `api_keys`, which is only
 * ever granted explicitly. A `restricted` key holds exactly the levels in its
 * `permissions` map.
 */
export type ApiKeyAccess = "full" | "restricted" | (string & {});

/** A key's level for every product. */
export interface ApiKeyPermissions {
    tts: "none" | "read" | "write" | (string & {});
    voices: "none" | "read" | "write" | (string & {});
    stt: "none" | "write" | (string & {});
    llm: "none" | "read" | "write" | (string & {});
    embeddings: "none" | "write" | (string & {});
    rerank: "none" | "write" | (string & {});
    account: "none" | "read" | (string & {});
    api_keys: "none" | "read" | "write" | (string & {});
}

/** An API key. Its secret is only ever shown once, in the answer to `apiKeys.create`. */
export interface ApiKey {
    /** A lowercase ULID. */
    id: string;
    /** The key's name. */
    name: string;
    /** The key's description, or `null`. */
    description: string | null;
    /** `nai_...` and the last four characters of the secret. */
    masked_key: string;
    /** `full` or `restricted`. */
    access: ApiKeyAccess;
    /** The effective level for every product. A full key reads as what it can do; `api_keys` is only ever granted explicitly. */
    permissions: ApiKeyPermissions;
    /** When the key stops working, or `null` for never. */
    expires_at: string | null;
    /** Addresses or CIDR ranges the key may be used from. Empty allows any address. */
    allowed_ips: string[];
    /** UZS per calendar month (UTC), or `null` for no limit. */
    monthly_spend_limit: number | null;
    /** UZS spent this calendar month (UTC). */
    spent_this_month: number;
    /** Whether the key works; a disabled key can be enabled again. */
    enabled: boolean;
    /** When the key was revoked, or `null`. A revoked key never works again. */
    revoked_at: string | null;
    /** When the key was last used, or `null`. */
    last_used_at: string | null;
    /** When the key was created (ISO 8601). */
    created_at: string;
    /** The whole key. Only in the answer to a create, and never again. */
    secret?: string;
}

/** The query of `apiKeys.list`. */
export interface ListApiKeysParams {
    /** Keys per page, from 1 to 100 (50 by default). */
    limit?: number | null;
    /** A page's `next_cursor`, to start from the page after it. Cursors are opaque: don't build them. */
    cursor?: string | null;
}

/** The key to create. `name` and `access` are required, so every key states what it may do; everything else is optional. */
export interface CreateApiKeyRequest {
    /** From 1 to 80 characters. */
    name: string;
    /** Up to 500 characters. */
    description?: string | null;
    /** `full` or `restricted`. */
    access: ApiKeyAccess;
    /**
     * Levels by product, such as `{tts: "write"}`. On a `restricted` key a
     * product left out is `none`. A `full` key already holds every other
     * product at its highest level, so its map may name only `api_keys`.
     */
    permissions?: Partial<ApiKeyPermissions>;
    /** When the key stops working (ISO 8601), or `null` for never. */
    expires_at?: string | null;
    /** In UZS per calendar month (UTC), from 0 to 999999999999.99 with at most two decimals. Leave it out, or send `null`, for no limit. */
    monthly_spend_limit?: number | null;
    /** Up to 100 addresses or CIDR ranges the key may be used from. */
    allowed_ips?: string[] | null;
}

/** The fields to change; a field left out stays as it is. `permissions` replaces the whole map, and `null` clears the expiry, the allowlist or the spend limit. */
export interface UpdateApiKeyRequest {
    /** From 1 to 80 characters. */
    name?: string;
    /** Up to 500 characters. */
    description?: string | null;
    /** `full` or `restricted`. */
    access?: ApiKeyAccess;
    /**
     * Replaces the whole map. Levels by product, such as `{tts: "write"}`. On
     * a `restricted` key a product left out is `none`. A `full` key already
     * holds every other product at its highest level, so its map may name
     * only `api_keys`.
     */
    permissions?: Partial<ApiKeyPermissions>;
    /** When the key stops working (ISO 8601); `null` clears the expiry. */
    expires_at?: string | null;
    /** In UZS per calendar month (UTC), from 0 to 999999999999.99 with at most two decimals. `null` removes the limit. */
    monthly_spend_limit?: number | null;
    /** Switches the key on or off. */
    enabled?: boolean;
    /** Up to 100 addresses or CIDR ranges; `null` or `[]` clears the allowlist. */
    allowed_ips?: string[] | null;
}
