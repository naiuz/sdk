import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {readBody, type WithCost} from "../core/parse";
import type {RerankRequest, RerankResponse} from "../types/rerank";

/** Ranks documents against a query. */
export class Rerank {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /**
     * Scores each document against the query and returns them by relevance,
     * highest first; billed per token across the query and all documents.
     * `cost` is the price from `X-Cost`. A timeout is never retried, because
     * the call may have been charged.
     */
    create(params: RerankRequest, options?: RequestOptions): APIPromise<WithCost<RerankResponse>> {
        return this.#http.request({method: "POST", path: "/rerank", body: params, retry: "paid", options}, readBody<RerankResponse>);
    }
}
