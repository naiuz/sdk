import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {requestPage, type PagePromise} from "../core/pagination";
import {readEnvelope, readNoContent, type WithRequestId} from "../core/parse";
import type {DeleteToolParams, SaveToolRequest, Tool} from "../types/tools";

/** The tools agents can use. */
export class Tools {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** Your organization's tools. */
    list(options?: RequestOptions): PagePromise<Tool> {
        return requestPage<Tool>(this.#http, {method: "GET", path: "/tools", retry: "safe", options});
    }

    /** One tool, with its config. Secrets appear by id, never by value. */
    retrieve(tool: string | number, options?: RequestOptions): APIPromise<WithRequestId<Tool>> {
        return this.#http.request({method: "GET", path: "/tools/{tool}", pathParams: {tool: String(tool)}, retry: "safe", options}, readEnvelope<Tool>);
    }

    /** Creates a webhook tool, which calls your systems, or a client tool, which runs in your page. */
    create(params: SaveToolRequest, options?: RequestOptions): APIPromise<WithRequestId<Tool>> {
        return this.#http.request({method: "POST", path: "/tools", body: params, retry: "once", options}, readEnvelope<Tool>);
    }

    /** Replaces a tool. Agents that use it get the change when it's saved. */
    update(tool: string | number, params: SaveToolRequest, options?: RequestOptions): APIPromise<WithRequestId<Tool>> {
        return this.#http.request({method: "PUT", path: "/tools/{tool}", pathParams: {tool: String(tool)}, body: params, retry: "safe", options}, readEnvelope<Tool>);
    }

    /** Deletes a tool. */
    delete(tool: string | number, params: DeleteToolParams = {}, options?: RequestOptions): APIPromise<void> {
        return this.#http.request({method: "DELETE", path: "/tools/{tool}", pathParams: {tool: String(tool)}, query: {...params}, retry: "safe", options}, readNoContent);
    }
}
