import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {WebhookVerificationError} from "../../src/index";
import {testClient} from "../helpers/client";
import {mockFetch} from "../helpers/mock-fetch";

const vectors = JSON.parse(readFileSync(new URL("../../../spec/webhooks/signature-vectors.json", import.meta.url), "utf8")) as {
    secret: string;
    now: number;
    tolerance_seconds: number;
    cases: {name: string; body: string; header: string; valid: boolean; secret?: string}[];
};
const webhooks = testClient(mockFetch().fetch).webhooks;
const verify = (body: string | Uint8Array, header: string | null, secret = vectors.secret) => webhooks.verify(body, header, secret, {now: vectors.now, toleranceSeconds: vectors.tolerance_seconds});

describe("webhooks.verify", () => {
    it.each(vectors.cases.filter((vector) => vector.valid))("takes $name", async ({body, header}) => {
        await expect(verify(body, header)).resolves.toEqual(JSON.parse(body));
    });

    it.each(vectors.cases.filter((vector) => !vector.valid))("refuses $name", async ({body, header, secret}) => {
        await expect(verify(body, header, secret)).rejects.toBeInstanceOf(WebhookVerificationError);
    });

    it("takes the body as bytes, as a framework's raw body is", async () => {
        const [valid] = vectors.cases.filter((vector) => vector.valid);
        await expect(verify(new TextEncoder().encode(valid?.body ?? ""), valid?.header ?? null)).resolves.toEqual(JSON.parse(valid?.body ?? ""));
    });

    it("names its error, for someone reading a log", async () => {
        await expect(verify("{}", null)).rejects.toHaveProperty("name", "WebhookVerificationError");
    });

    it("refuses a request with no header", async () => {
        await expect(verify("{}", null)).rejects.toBeInstanceOf(WebhookVerificationError);
    });

    it("goes by the clock when it isn't told the time", async () => {
        const [valid] = vectors.cases.filter((vector) => vector.valid);
        await expect(webhooks.verify(valid?.body ?? "", valid?.header ?? "", vectors.secret)).rejects.toThrow(/too old/);
    });
});
