import type {APIPromise} from "../core/api-promise";
import type {HttpClient, IdempotentRequestOptions} from "../core/http";
import {readEnvelope, type WithRequestId} from "../core/parse";
import type {CreateTranscriptionRequest, Transcription} from "../types/transcription";

/** Speech to text. */
export class Stt {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /**
     * Transcribes an audio file, and resolves with the text, the language,
     * the duration, timed segments, the price and your balance after the
     * charge. It is billed by duration at the per-minute rate, settled on the
     * actual duration. Every call sends an Idempotency-Key, yours or a
     * generated one, the same on each retry, so a retry never charges twice.
     * A transcription's key is kept indefinitely: reuse one only for the same
     * file.
     */
    transcribe(params: CreateTranscriptionRequest, options?: IdempotentRequestOptions): APIPromise<WithRequestId<Transcription>> {
        return this.#http.request({method: "POST", path: "/stt/transcribe", multipart: {params, files: ["file"]}, retry: "idempotent", options}, readEnvelope<Transcription>);
    }
}
