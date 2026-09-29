import {describe, expect, it} from "vitest";
import {numberHeader, readBody, readEnvelope, readNoContent, readText} from "../../src/core/parse";
import {APIConnectionError, APIError} from "../../src/errors";
import {KEY, testAttempt} from "../helpers/http";

const jsonResponse = (body: unknown, headers: Record<string, string> = {}, status = 200): Response =>
    new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", ...headers}});

/** A body that fails partway, as a dropped connection makes it fail. */
const brokenBody = (cause: Error): Response =>
    new Response(
        new ReadableStream({
            start(controller) {
                controller.error(cause);
            },
        }),
    );

describe("readEnvelope", () => {
    it("returns data with request_id attached, readable but not enumerable", async () => {
        const voice = await readEnvelope<{id: string}>(jsonResponse({data: {id: "uz-sardor"}, request_id: "req-1"}), testAttempt());
        expect(voice.id).toBe("uz-sardor");
        expect(voice.request_id).toBe("req-1");
        expect(Object.keys(voice)).toEqual(["id"]);
        expect(JSON.stringify(voice)).toBe('{"id":"uz-sardor"}');
        expect({...voice}).toEqual({id: "uz-sardor"});
    });

    it("passes through fields the SDK doesn't know yet", async () => {
        const voice = await readEnvelope<{id: string}>(jsonResponse({data: {id: "v1", brand_new: [1, 2]}, request_id: "req-1"}), testAttempt());
        expect(voice).toEqual({id: "v1", brand_new: [1, 2]});
    });

    it("falls back to the X-Request-Id header, then to null, when the envelope has no request_id", async () => {
        expect((await readEnvelope(jsonResponse({data: {id: "v1"}}, {"x-request-id": "req-header"}), testAttempt())).request_id).toBe("req-header");
        expect((await readEnvelope(jsonResponse({data: {id: "v1"}}), testAttempt())).request_id).toBeNull();
    });

    it("raises APIError with the status when a success answer isn't JSON, as from a misrouted proxy", async () => {
        const page = new Response("<html>Sign in to the Wi-Fi</html>", {status: 200, statusText: "OK", headers: {"content-type": "text/html"}});
        const error = await readEnvelope(page, testAttempt()).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APIError);
        expect(error).toMatchObject({status: 200, code: null, message: "OK: <html>Sign in to the Wi-Fi</html>"});
    });

    it("redacts the API key from a success answer it can't use", async () => {
        const echo = new Response(`<pre>Authorization: Bearer ${KEY}</pre>`, {status: 200, statusText: "OK", headers: {"content-type": "text/html"}});
        const error = await readEnvelope(echo, testAttempt()).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APIError);
        expect((error as Error).message).toBe("OK: <pre>Authorization: Bearer [redacted]</pre>");
    });

    it("raises APIError when the JSON has no data object", async () => {
        await expect(readEnvelope(jsonResponse({request_id: "req-1"}), testAttempt())).rejects.toBeInstanceOf(APIError);
        await expect(readEnvelope(jsonResponse({data: [1], request_id: "req-1"}), testAttempt())).rejects.toBeInstanceOf(APIError);
    });
});

describe("readBody", () => {
    it("returns the body as it is, with cost from X-Cost, not enumerable", async () => {
        const body = await readBody<{id: string}>(jsonResponse({id: "chatcmpl-1"}, {"x-cost": "0.34"}), testAttempt());
        expect(body.cost).toBe(0.34);
        expect(JSON.stringify(body)).toBe('{"id":"chatcmpl-1"}');
    });

    it("leaves cost out when X-Cost is absent or not a number", async () => {
        expect((await readBody(jsonResponse({object: "list"}), testAttempt())).cost).toBeUndefined();
        expect((await readBody(jsonResponse({object: "list"}, {"x-cost": "free"}), testAttempt())).cost).toBeUndefined();
    });
});

describe("readNoContent", () => {
    it("resolves to undefined for a 204", async () => {
        await expect(readNoContent(new Response(null, {status: 204}))).resolves.toBeUndefined();
    });
});

describe("readText", () => {
    it("raises APIConnectionError when the body fails to arrive, keeping the cause", async () => {
        const error = await readText(brokenBody(new TypeError("terminated"))).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(APIConnectionError);
        expect((error as APIConnectionError).cause).toBeInstanceOf(TypeError);
    });

    it("says what failed when the connection drops mid-body", async () => {
        // Node's fetch: TypeError("terminated"), caused by the socket's own error.
        const dropped = new TypeError("terminated", {cause: Object.assign(new Error("other side closed"), {code: "UND_ERR_SOCKET"})});
        const error = await readText(brokenBody(dropped)).catch((caught: unknown) => caught);
        expect((error as Error).message).toBe("The connection failed while the response arrived: other side closed");
    });
});

describe("numberHeader", () => {
    it("reads a number, and gives null for an absent, blank or non-numeric header", () => {
        const headers = new Headers({"x-cost": " 12.5 ", "x-blank": " ", "x-word": "abc"});
        expect(numberHeader(headers, "x-cost")).toBe(12.5);
        expect(numberHeader(headers, "x-missing")).toBeNull();
        expect(numberHeader(headers, "x-blank")).toBeNull();
        expect(numberHeader(headers, "x-word")).toBeNull();
    });
});
