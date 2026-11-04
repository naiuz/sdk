import {describe, expect, it} from "vitest";
import {testClient} from "../helpers/client";
import {envelope, mockFetch} from "../helpers/mock-fetch";

describe("agents", () => {
    it("signedUrl() sends each variable as its own vars[name], beside the customer", async () => {
        const {fetch, requests} = mockFetch(envelope({signed_url: "wss://example.test/session", expires_at: "2026-11-04T10:15:00Z"}));
        await testClient(fetch).agents.signedUrl("agent_1", {customer_id: "crm-42", vars: {plan: "gold", seats: 3, trial: true}});
        expect(requests[0]?.url.pathname.endsWith("/agents/agent_1/signed-url")).toBe(true);
        expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({customer_id: "crm-42", "vars[plan]": "gold", "vars[seats]": "3", "vars[trial]": "true"});
    });

    it("signedUrl() sends no query when given none", async () => {
        const {fetch, requests} = mockFetch(envelope({signed_url: "wss://example.test/session", expires_at: "2026-11-04T10:15:00Z"}));
        await testClient(fetch).agents.signedUrl("agent_1");
        expect(requests[0]?.url.search).toBe("");
    });
});
