import {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {readBody, type WithCost} from "../core/parse";
import {NeuronAIError} from "../errors";
import type {ChatCompletion, CreateChatCompletionRequest} from "../types/chat";

/** Chat completions. */
export class Completions {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /**
     * A model response for a chat conversation, billed per token. `cost` is
     * the price from `X-Cost`. A timeout is never retried, because the call
     * may have been charged. Streaming (`stream: true`) is not supported by
     * this version yet: it rejects with NeuronAIError before sending anything.
     */
    create(params: CreateChatCompletionRequest, options?: RequestOptions): APIPromise<WithCost<ChatCompletion>> {
        if (params.stream === true) {
            return new APIPromise(Promise.reject(new NeuronAIError("stream: true is not supported yet: streaming arrives in a later version of @naiuz/sdk.")));
        }
        return this.#http.request({method: "POST", path: "/chat/completions", body: params, retry: "paid", options}, readBody<ChatCompletion>);
    }
}

/** Chat. */
export class Chat {
    /** Chat completions. */
    readonly completions: Completions;

    constructor(http: HttpClient) {
        this.completions = new Completions(http);
    }
}
