import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {readBody, type WithCost} from "../core/parse";
import type {CreateEmbeddingRequest, EmbeddingResponse} from "../types/embeddings";

/** Dense vectors for text. */
export class Embeddings {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /**
     * A 1024-dimensional vector per input, billed per input token. `cost` is
     * the price from `X-Cost`. A timeout is never retried, because the call
     * may have been charged.
     */
    create(params: CreateEmbeddingRequest, options?: RequestOptions): APIPromise<WithCost<EmbeddingResponse>> {
        return this.#http.request({method: "POST", path: "/embeddings", body: params, retry: "paid", options}, readBody<EmbeddingResponse>);
    }
}
