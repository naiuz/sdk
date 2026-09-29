import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {readBody, type WithCost} from "../core/parse";
import type {ModelList} from "../types/models";

/** The chat models available to your account. */
export class Models {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** The chat models available to your account, in OpenAI's list shape. */
    list(options?: RequestOptions): APIPromise<WithCost<ModelList>> {
        return this.#http.request({method: "GET", path: "/models", retry: "safe", options}, readBody<ModelList>);
    }
}
