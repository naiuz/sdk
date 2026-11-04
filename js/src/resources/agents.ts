import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {requestPage, type PagePromise} from "../core/pagination";
import {readEnvelope, type WithRequestId} from "../core/parse";
import type {Agent, AgentDraftSaved, AgentSignedUrl, AgentSignedUrlParams, AgentStatus, CreateAgentRequest, CreatedAgent, ListAgentsParams, PublishAgentRequest, UpdateAgentRequest} from "../types/agents";

/** Your organization's agents. */
export class Agents {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** Your organization's agents, the ones changed last first. Loop over the result for every agent, each page fetched when the loop reaches it. */
    list(params: ListAgentsParams = {}, options?: RequestOptions): PagePromise<Agent> {
        return requestPage<Agent>(this.#http, {method: "GET", path: "/agents", query: {...params}, retry: "safe", options});
    }

    /** An agent, with its draft as `config` and the `revision` to change it from. */
    retrieve(agent: string, options?: RequestOptions): APIPromise<WithRequestId<Agent>> {
        return this.#http.request({method: "GET", path: "/agents/{agent}", pathParams: {agent}, retry: "safe", options}, readEnvelope<Agent>);
    }

    /** Creates an agent from a template. The model fits its prompt to your answers, and `personalized` says when it couldn't. */
    create(params: CreateAgentRequest, options?: RequestOptions): APIPromise<WithRequestId<CreatedAgent>> {
        return this.#http.request({method: "POST", path: "/agents", body: params, retry: "once", options}, readEnvelope<CreatedAgent>);
    }

    /** Replaces whole sections of the draft. Someone else's change since you read it raises a conflict: read the agent again. Customers see nothing of this until you publish. */
    update(agent: string, params: UpdateAgentRequest, options?: RequestOptions): APIPromise<WithRequestId<AgentDraftSaved>> {
        return this.#http.request({method: "PATCH", path: "/agents/{agent}", pathParams: {agent}, body: params, retry: "once", options}, readEnvelope<AgentDraftSaved>);
    }

    /** Makes the draft live as a new version. What stands in the way is an error with `fields`, naming each part of the config. */
    publish(agent: string, params: PublishAgentRequest, options?: RequestOptions): APIPromise<WithRequestId<AgentStatus>> {
        return this.#http.request({method: "POST", path: "/agents/{agent}/publish", pathParams: {agent}, body: params, retry: "once", options}, readEnvelope<AgentStatus>);
    }

    /** A link your page opens a conversation with, for a private agent or to bind a conversation to a customer of yours. It must be used within 15 minutes, once. Make it on your server. */
    signedUrl(agent: string, params: AgentSignedUrlParams = {}, options?: RequestOptions): APIPromise<WithRequestId<AgentSignedUrl>> {
        const {vars, ...rest} = params;
        const query = {...rest, ...Object.fromEntries(Object.entries(vars ?? {}).map(([name, value]) => [`vars[${name}]`, value]))};
        return this.#http.request({method: "GET", path: "/agents/{agent}/signed-url", pathParams: {agent}, query, retry: "safe", options}, readEnvelope<AgentSignedUrl>);
    }
}
