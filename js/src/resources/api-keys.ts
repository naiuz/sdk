import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {requestPage, type PagePromise} from "../core/pagination";
import {readEnvelope, readNoContent, type WithRequestId} from "../core/parse";
import type {ApiKey, CreateApiKeyRequest, ListApiKeysParams, UpdateApiKeyRequest} from "../types/api-keys";

/** Your organization's API keys. */
export class ApiKeys {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** Your organization's keys, newest first, revoked ones included. Await it for the first page, or loop over it with `for await` for every key. */
    list(params: ListApiKeysParams = {}, options?: RequestOptions): PagePromise<ApiKey> {
        return requestPage<ApiKey>(this.#http, {method: "GET", path: "/api-keys", query: {...params}, retry: "safe", options});
    }

    /**
     * Creates a key, and resolves with it and its `secret`: the only time the
     * secret is ever shown, so store it now. The new key never holds more than
     * the calling key. Only a 429 or a connection that was never made is
     * retried, since a retry could create a second key.
     */
    create(params: CreateApiKeyRequest, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>> {
        return this.#http.request({method: "POST", path: "/api-keys", body: params, retry: "once", options}, readEnvelope<ApiKey>);
    }

    /** One key by id. A key of another organization answers 404 `not_found`. */
    retrieve(id: string, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>> {
        return this.#http.request({method: "GET", path: "/api-keys/{id}", pathParams: {id}, retry: "safe", options}, readEnvelope<ApiKey>);
    }

    /**
     * Changes a key. Send only the fields to change. A change that gives the
     * key more power is checked as if the key were being created, and a
     * revoked key can't be changed (409 `conflict`).
     */
    update(id: string, params: UpdateApiKeyRequest, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>> {
        return this.#http.request({method: "PATCH", path: "/api-keys/{id}", pathParams: {id}, body: params, retry: "safe", options}, readEnvelope<ApiKey>);
    }

    /** Revokes a key for good: it stops working at once and can never be switched back on. A key may revoke itself, to rotate. */
    revoke(id: string, options?: RequestOptions): APIPromise<void> {
        return this.#http.request({method: "POST", path: "/api-keys/{id}/revoke", pathParams: {id}, retry: "safe", options}, readNoContent);
    }
}
