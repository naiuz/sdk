import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {readEnvelope, type WithRequestId} from "../core/parse";
import type {Balance, Usage, UsageParams} from "../types/account";

/** Your organization's balance and usage. */
export class Account {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** The remaining credit for the calling key's organization. Use it to surface a low balance before a request fails with 402. */
    balance(options?: RequestOptions): APIPromise<WithRequestId<Balance>> {
        return this.#http.request({method: "GET", path: "/balance", retry: "safe", options}, readEnvelope<Balance>);
    }

    /**
     * Spend and request counts for the calling key's organization over the
     * last `days` (7, 30 or 90; 30 by default), grouped by service and by API
     * key. Reading usage is free.
     */
    usage(params: UsageParams = {}, options?: RequestOptions): APIPromise<WithRequestId<Usage>> {
        return this.#http.request({method: "GET", path: "/usage", query: {...params}, retry: "safe", options}, readEnvelope<Usage>);
    }
}
