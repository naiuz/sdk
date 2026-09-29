import type {APIPromise} from "../core/api-promise";
import type {HttpClient, IdempotentRequestOptions, RequestOptions} from "../core/http";
import {requestPage, type PagePromise} from "../core/pagination";
import {readEnvelope, readNoContent, type WithRequestId} from "../core/parse";
import type {CreateVoiceRequest, ListVoicesParams, ReplaceVoiceAudioRequest, UpdateVoiceRequest, Voice} from "../types/voices";

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
     * Clones a voice from a 10–15 second reference clip, sent as
     * multipart/form-data, and resolves with the new voice: use its `id` as
     * `voice_id` when synthesizing. Every call sends an Idempotency-Key,
     * yours or a generated one, the same on each retry: a replay of the key
     * resolves with the voice it created, as it is now, instead of cloning
     * another. When the voice service can't be reached or refuses the clip,
     * the API answers 502 `upstream_error`, and nothing is created.
     */
    create(params: CreateVoiceRequest, options?: IdempotentRequestOptions): APIPromise<WithRequestId<Voice>> {
        return this.#http.request({method: "POST", path: "/tts/voices", multipart: {params, files: ["ref_audio"]}, retry: "idempotent", options}, readEnvelope<Voice>);
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

    /**
     * Replaces a voice clone's reference clip, and optionally its transcript,
     * sent as multipart/form-data. The clone keeps its id. Replacing always
     * re-creates the voice, which can take several minutes: pass a longer
     * `timeout` for it. A timeout is never retried here, because the voice
     * may still be re-creating on the server. When the voice service fails,
     * the API answers 502 `upstream_error`, and its message says whether the
     * old clip was kept.
     */
    replaceAudio(id: string, params: ReplaceVoiceAudioRequest, options?: RequestOptions): APIPromise<WithRequestId<Voice>> {
        return this.#http.request({method: "POST", path: "/tts/voices/{id}/audio", pathParams: {id}, multipart: {params, files: ["ref_audio"]}, retry: "recreate", options}, readEnvelope<Voice>);
    }

    /** Deletes a voice clone for good. Stock voices can't be deleted: like an unknown id, they answer 404 `not_found`. */
    delete(id: string, options?: RequestOptions): APIPromise<void> {
        return this.#http.request({method: "DELETE", path: "/tts/voices/{id}", pathParams: {id}, retry: "safe", options}, readNoContent);
    }
}
