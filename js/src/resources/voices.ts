import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {requestPage, type PagePromise} from "../core/pagination";
import {readEnvelope, readNoContent, type WithRequestId} from "../core/parse";
import type {ListVoicesParams, UpdateVoiceRequest, Voice} from "../types/voices";

/** Stock voices and your organization's voice clones. */
export class Voices {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /**
     * Stock voices first, in their catalog order, then your organization's
     * ready clones, newest first. `type` narrows to `stock` or `custom`, and
     * `language` filters by language. Await it for the first page, or loop
     * over it with `for await` for every voice.
     */
    list(params: ListVoicesParams = {}, options?: RequestOptions): PagePromise<Voice> {
        return requestPage<Voice>(this.#http, {method: "GET", path: "/tts/voices", query: {...params}, retry: "safe", options});
    }

    /** One voice by id. Stock voices are public; a clone of another organization answers 404 `not_found`. */
    retrieve(id: string, options?: RequestOptions): APIPromise<WithRequestId<Voice>> {
        return this.#http.request({method: "GET", path: "/tts/voices/{id}", pathParams: {id}, retry: "safe", options}, readEnvelope<Voice>);
    }

    /**
     * Changes a voice clone's name, language, transcript, tags or category.
     * The clone keeps its id. Changing the language or the transcript
     * re-creates the voice, which can take several minutes: pass a longer
     * `timeout` for it. A timeout is never retried here, because the voice
     * may still be re-creating on the server.
     */
    update(id: string, params: UpdateVoiceRequest, options?: RequestOptions): APIPromise<WithRequestId<Voice>> {
        return this.#http.request({method: "PATCH", path: "/tts/voices/{id}", pathParams: {id}, body: params, retry: "recreate", options}, readEnvelope<Voice>);
    }

    /** Deletes a voice clone for good. Stock voices can't be deleted: like an unknown id, they answer 404 `not_found`. */
    delete(id: string, options?: RequestOptions): APIPromise<void> {
        return this.#http.request({method: "DELETE", path: "/tts/voices/{id}", pathParams: {id}, retry: "safe", options}, readNoContent);
    }
}
