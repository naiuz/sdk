import {HttpClient, type Attempt, type Fetch, type HttpClientConfig} from "../../src/core/http";

/** The key every unit test's client sends. */
export const KEY = "nai_unit_test_key";
export const BASE_URL = "https://my.neuronai.uz/api/v1";
/** The clock unit tests run at: Tue, 29 Sep 2026 10:00:00 GMT. */
export const NOW = Date.UTC(2026, 8, 29, 10, 0, 0);

/** An HttpClient that records its waits instead of sleeping, with no jitter and a fixed clock. */
export function httpClient(fetch: Fetch, overrides: Partial<HttpClientConfig> = {}): {http: HttpClient; sleeps: number[]} {
    const sleeps: number[] = [];
    const http = new HttpClient({
        apiKey: KEY,
        baseURL: BASE_URL,
        timeout: 1000,
        maxRetries: 2,
        defaultHeaders: {},
        userAgent: "naiuz-js/test (Node 20.19)",
        fetch,
        sleep: (ms) => {
            sleeps.push(ms);
            return Promise.resolve();
        },
        random: () => 0,
        now: () => NOW,
        ...overrides,
    });
    return {http, sleeps};
}

/** An attempt to hand a reader called on its own: it never aborts, and it redacts KEY. */
export function testAttempt(overrides: Partial<Attempt> = {}): Attempt {
    return {
        signal: new AbortController().signal,
        timeout: 1000,
        abort: () => undefined,
        disarm: () => undefined,
        adopt: () => () => undefined,
        redact: (text) => text.split(KEY).join("[redacted]"),
        ...overrides,
    };
}
