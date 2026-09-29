import {describe, expect, it} from "vitest";
import {buildURL, encodePathParam} from "../../src/core/url";
import {NeuronAIError} from "../../src/errors";

const BASE_URL = "https://my.neuronai.uz/api/v1";

describe("encodePathParam", () => {
    it("leaves RFC 3986's unreserved characters alone", () => {
        expect(encodePathParam("AZaz09-._~")).toBe("AZaz09-._~");
    });

    it("escapes everything else as UTF-8 %XX, !'()* included", () => {
        expect(encodePathParam("it's (1)*!")).toBe("it%27s%20%281%29%2A%21");
        expect(encodePathParam("a/b?c#d")).toBe("a%2Fb%3Fc%23d");
        expect(encodePathParam("ovoz é")).toBe("ovoz%20%C3%A9");
    });
});

describe("buildURL", () => {
    it("joins the base URL and the path, filling in encoded path parameters", () => {
        expect(buildURL(BASE_URL, "/tts/voices/{id}", {id: "voice (1)"})).toBe("https://my.neuronai.uz/api/v1/tts/voices/voice%20%281%29");
        expect(buildURL(BASE_URL, "/api-keys/{id}/revoke", {id: "01j9"})).toBe("https://my.neuronai.uz/api/v1/api-keys/01j9/revoke");
    });

    it("ignores trailing slashes on the base URL", () => {
        expect(buildURL(`${BASE_URL}//`, "/balance")).toBe("https://my.neuronai.uz/api/v1/balance");
    });

    it("leaves undefined and null query values out, and sends the rest as strings", () => {
        const url = new URL(buildURL(BASE_URL, "/tts/voices", {}, {type: "custom", language: undefined, limit: 2, cursor: null, flag: false}));
        expect(url.search).toBe("?type=custom&limit=2&flag=false");
    });

    it("sends an opaque cursor back exactly as it came, whatever it holds", () => {
        const cursor = "eyJpZCI6IjAxaiJ9+/=&x y";
        const url = new URL(buildURL(BASE_URL, "/tts/voices", {}, {cursor}));
        expect(url.searchParams.get("cursor")).toBe(cursor);
    });

    it.each(["", ".", ".."])("refuses the path parameter %j, which would name another endpoint", (id) => {
        expect(() => buildURL(BASE_URL, "/tts/voices/{id}", {id})).toThrow(NeuronAIError);
        expect(() => buildURL(BASE_URL, "/tts/voices/{id}", {id})).toThrow('The path parameter "id" must be a non-empty string other than "." and "..".');
    });

    it("refuses a path parameter that isn't a string", () => {
        const pathParams = {id: 42} as unknown as Record<string, string>;
        expect(() => buildURL(BASE_URL, "/tts/voices/{id}", pathParams)).toThrow(NeuronAIError);
        expect(() => buildURL(BASE_URL, "/tts/voices/{id}", {})).toThrow(NeuronAIError);
    });
});
