import {describe, expect, it, vi} from "vitest";
import {HttpClient} from "../../src/core/http";
import {testClient} from "../helpers/client";
import {envelope, mockFetch} from "../helpers/mock-fetch";

describe("account", () => {
    it("balance() reads GET /balance", async () => {
        const {fetch, requests} = mockFetch(envelope({balance: 10000, currency: "UZS"}, "req-balance"));
        const balance = await testClient(fetch).account.balance();
        expect(balance).toEqual({balance: 10000, currency: "UZS"});
        expect(balance.request_id).toBe("req-balance");
        expect(requests[0]?.method).toBe("GET");
        expect(requests[0]?.url.pathname).toBe("/api/v1/balance");
        expect(requests[0]?.url.search).toBe("");
    });

    it("usage() sends days as the query, and no query when it is left out", async () => {
        const {fetch, requests} = mockFetch(envelope({period: {days: 7}}), envelope({period: {days: 30}}));
        const client = testClient(fetch);
        await client.account.usage({days: 7});
        await client.account.usage();
        expect(requests.map((request) => request.url.pathname + request.url.search)).toEqual(["/api/v1/usage?days=7", "/api/v1/usage"]);
    });

    it("retries both as safe calls", async () => {
        const send = vi.spyOn(HttpClient.prototype, "send");
        const client = testClient(mockFetch(envelope({}), envelope({})).fetch);
        await client.account.balance();
        await client.account.usage();
        expect(send.mock.calls.map(([request]) => request.retry)).toEqual(["safe", "safe"]);
    });
});
