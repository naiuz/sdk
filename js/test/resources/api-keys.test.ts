import {describe, expect, expectTypeOf, it, vi} from "vitest";
import {HttpClient} from "../../src/core/http";
import type {ApiKeyAccess, ApiKeyPermissions} from "../../src/types/api-keys";
import {testClient} from "../helpers/client";
import {apiError, envelope, json, mockFetch} from "../helpers/mock-fetch";

const key = {id: "01j9zqa1b2c3d4e5f6g7h8j9k0", name: "Production", enabled: true};

describe("apiKeys", () => {
    it("list() pages through the keys", async () => {
        const {fetch, requests} = mockFetch(json(200, {data: [key], next_cursor: "c2", request_id: "r1"}), json(200, {data: [{...key, id: "k2"}], next_cursor: null, request_id: "r2"}));
        const ids: string[] = [];
        for await (const item of testClient(fetch).apiKeys.list({limit: 1})) ids.push(item.id);
        expect(ids).toEqual([key.id, "k2"]);
        expect(requests.map((request) => request.url.search)).toEqual(["?limit=1", "?limit=1&cursor=c2"]);
    });

    it("create() posts the key and resolves with its secret", async () => {
        const {fetch, requests} = mockFetch(envelope({...key, secret: "nai_shown_once"}, "req-create", 201));
        const created = await testClient(fetch).apiKeys.create({name: "CI", access: "restricted", permissions: {tts: "write"}});
        expect(created.secret).toBe("nai_shown_once");
        expect(requests[0]?.method).toBe("POST");
        expect(requests[0]?.url.pathname).toBe("/api/v1/api-keys");
        expect(JSON.parse(requests[0]?.body ?? "null")).toStrictEqual({name: "CI", access: "restricted", permissions: {tts: "write"}});
        expect(requests[0]?.headers.has("idempotency-key")).toBe(false);
    });

    it("retrieve() and update() address the key by id", async () => {
        const {fetch, requests} = mockFetch(envelope(key), envelope({...key, enabled: false}));
        const client = testClient(fetch);
        await client.apiKeys.retrieve(key.id);
        const updated = await client.apiKeys.update(key.id, {enabled: false, monthly_spend_limit: null});
        expect(updated.enabled).toBe(false);
        expect(requests.map((request) => `${request.method} ${request.url.pathname}`)).toEqual([`GET /api/v1/api-keys/${key.id}`, `PATCH /api/v1/api-keys/${key.id}`]);
        expect(JSON.parse(requests[1]?.body ?? "null")).toStrictEqual({enabled: false, monthly_spend_limit: null});
    });

    it("revoke() posts without a body and resolves to undefined", async () => {
        const {fetch, requests} = mockFetch(new Response(null, {status: 204}));
        await expect(testClient(fetch).apiKeys.revoke(key.id)).resolves.toBeUndefined();
        expect(`${String(requests[0]?.method)} ${String(requests[0]?.url.pathname)}`).toBe(`POST /api/v1/api-keys/${key.id}/revoke`);
        expect(requests[0]?.body).toBeNull();
        expect(requests[0]?.headers.has("content-type")).toBe(false);
    });

    it("never retries create after a 5xx, which could make a second key", async () => {
        const {fetch, requests} = mockFetch(apiError(503, "service_unavailable", {"retry-after": "0"}), envelope(key));
        await expect(testClient(fetch, {maxRetries: 2}).apiKeys.create({name: "CI", access: "full"})).rejects.toMatchObject({status: 503});
        expect(requests).toHaveLength(1);
    });

    it("retries create only as once, and the rest as safe calls", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        const client = testClient(mockFetch(json(200, {data: [], next_cursor: null, request_id: "r"}), envelope(key), envelope(key), envelope(key), new Response(null, {status: 204})).fetch);
        await client.apiKeys.list();
        await client.apiKeys.create({name: "CI", access: "full"});
        await client.apiKeys.retrieve(key.id);
        await client.apiKeys.update(key.id, {name: "Renamed"});
        await client.apiKeys.revoke(key.id);
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["safe", "once", "safe", "safe", "safe"]);
    });

    it("types access and permission levels as open unions", () => {
        expectTypeOf<ApiKeyAccess>().toEqualTypeOf<"full" | "restricted" | (string & {})>();
        expectTypeOf<ApiKeyPermissions["stt"]>().toEqualTypeOf<"none" | "write" | (string & {})>();
    });
});
