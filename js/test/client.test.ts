import {inspect} from "node:util";
import {describe, expect, it, vi} from "vitest";
import {DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT, NeuronAI} from "../src/client";
import {runtimeName} from "../src/core/runtime";
import {NeuronAIError} from "../src/errors";
import {VERSION} from "../src/version";
import {envelope, mockFetch} from "./helpers/mock-fetch";

const KEY = "nai_client_test_key";

describe("new NeuronAI()", () => {
    it("takes the key from apiKey, else from NEURONAI_API_KEY", async () => {
        vi.stubEnv("NEURONAI_API_KEY", "nai_from_env");
        const {fetch, requests} = mockFetch(envelope({}), envelope({}));
        await new NeuronAI({fetch}).account.balance();
        await new NeuronAI({apiKey: KEY, fetch}).account.balance();
        expect(requests.map((request) => request.headers.get("authorization"))).toEqual(["Bearer nai_from_env", `Bearer ${KEY}`]);
    });

    it("fails at construction, not on the first call, when there is no key", () => {
        vi.stubEnv("NEURONAI_API_KEY", "");
        expect(() => new NeuronAI()).toThrow(NeuronAIError);
        expect(() => new NeuronAI({apiKey: "  "})).toThrow("The API key is missing: pass it as new NeuronAI({ apiKey }), or set NEURONAI_API_KEY.");
    });

    it("trims the whitespace around a key, as a line of an env file leaves it", async () => {
        vi.stubEnv("NEURONAI_API_KEY", `  ${KEY}\n`);
        const {fetch, requests} = mockFetch(envelope({}));
        await new NeuronAI({fetch}).account.balance();
        expect(requests[0]?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    });

    it("refuses a key with a space, a line break or a control character inside, without quoting it", () => {
        for (const apiKey of ["nai_abc def", "nai_abc\ndef", "nai_abc\u0000def", "nai_ключ"]) {
            let message = "";
            try {
                new NeuronAI({apiKey, fetch: mockFetch().fetch});
            } catch (error) {
                expect(error).toBeInstanceOf(NeuronAIError);
                message = (error as Error).message;
            }
            expect(message).toBe("The API key contains a space, a line break or another character a header can't carry. Check how it was copied.");
            expect(message).not.toContain("abc");
        }
    });

    it("takes the base URL from baseURL, else NEURONAI_BASE_URL, else the default, without a trailing slash", () => {
        vi.stubEnv("NEURONAI_BASE_URL", "");
        expect(new NeuronAI({apiKey: KEY}).baseURL).toBe(DEFAULT_BASE_URL);
        expect(DEFAULT_BASE_URL).toBe("https://my.neuronai.uz/api/v1");
        vi.stubEnv("NEURONAI_BASE_URL", "https://my.neuronai.uz/from-env/api/v1/");
        expect(new NeuronAI({apiKey: KEY}).baseURL).toBe("https://my.neuronai.uz/from-env/api/v1");
        expect(new NeuronAI({apiKey: KEY, baseURL: "http://my.neuronai.uz/from-option/api/v1/"}).baseURL).toBe("http://my.neuronai.uz/from-option/api/v1");
    });

    it("refuses a base URL that isn't an http or https URL", () => {
        expect(() => new NeuronAI({apiKey: KEY, baseURL: "my.neuronai.uz/api/v1"})).toThrow(NeuronAIError);
        expect(() => new NeuronAI({apiKey: KEY, baseURL: "ftp://my.neuronai.uz"})).toThrow('baseURL must be an http or https URL, not "ftp://my.neuronai.uz".');
    });

    it("defaults to a 300000 ms timeout and 2 retries, and refuses invalid ones", () => {
        const client = new NeuronAI({apiKey: KEY});
        expect([client.timeout, client.maxRetries]).toEqual([300_000, 2]);
        expect([DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES]).toEqual([300_000, 2]);
        expect(() => new NeuronAI({apiKey: KEY, timeout: -1})).toThrow(NeuronAIError);
        expect(() => new NeuronAI({apiKey: KEY, timeout: Number.NaN})).toThrow(NeuronAIError);
        expect(() => new NeuronAI({apiKey: KEY, maxRetries: 1.5})).toThrow(NeuronAIError);
    });

    it("won't run in a browser page unless dangerouslyAllowBrowser is set", () => {
        vi.stubGlobal("window", {document: {}});
        expect(() => new NeuronAI({apiKey: KEY})).toThrow(NeuronAIError);
        expect(() => new NeuronAI({apiKey: KEY})).toThrow(/won't run in a browser, where your API key would be exposed/);
        expect(new NeuronAI({apiKey: KEY, dangerouslyAllowBrowser: true})).toBeInstanceOf(NeuronAI);
    });

    it("calls the fetch it is given as a plain function, as a browser's fetch requires", async () => {
        const receivers: unknown[] = [];
        const fetch = function (this: unknown): Promise<Response> {
            receivers.push(this);
            return Promise.resolve(envelope({}));
        };
        await new NeuronAI({apiKey: KEY, fetch}).account.balance();
        expect(receivers).toEqual([undefined]);
    });

    it("sends defaultHeaders with every call", async () => {
        const {fetch, requests} = mockFetch(envelope({}));
        await new NeuronAI({apiKey: KEY, fetch, defaultHeaders: {"x-app": "shop"}}).account.balance();
        expect(requests[0]?.headers.get("x-app")).toBe("shop");
    });

    it("never shows the key when printed", () => {
        const client = new NeuronAI({apiKey: KEY, fetch: mockFetch().fetch});
        expect(inspect(client, {depth: Infinity, showHidden: true})).not.toContain(KEY);
        expect(JSON.stringify(client)).not.toContain(KEY);
        expect(String(client as unknown)).not.toContain(KEY);
    });
});

describe("the User-Agent", () => {
    it("is naiuz-js/<version> (<runtime> <major.minor>)", async () => {
        const {fetch, requests} = mockFetch(envelope({}));
        await new NeuronAI({apiKey: KEY, fetch}).account.balance();
        const [major, minor] = process.versions.node.split(".");
        expect(requests[0]?.headers.get("user-agent")).toBe(`naiuz-js/${VERSION} (Node ${String(major)}.${String(minor)})`);
    });

    it("names Bun and Deno, though both define process too", () => {
        vi.stubGlobal("Bun", {version: "1.2.19"});
        expect(runtimeName()).toBe("Bun 1.2");
        vi.stubGlobal("Deno", {version: {deno: "2.4.3"}});
        expect(runtimeName()).toBe("Deno 2.4");
    });
});
