import {NeuronAI, type ClientOptions} from "../../src/client";
import type {Fetch} from "../../src/core/http";

/** The key every resource test's client sends. */
export const CLIENT_KEY = "nai_resource_test_key";

/** A client on the mock fetch that doesn't retry, unless the test says otherwise. */
export function testClient(fetch: Fetch, options: ClientOptions = {}): NeuronAI {
    return new NeuronAI({apiKey: CLIENT_KEY, fetch, maxRetries: 0, ...options});
}
