import type {APIPromise} from "../core/api-promise";
import type {HttpClient, IdempotentRequestOptions, RequestOptions} from "../core/http";
import {readEnvelope, type WithRequestId} from "../core/parse";
import type {SynthesizeSpeechRequest, TtsJob} from "../types/tts";

/** Synthesis jobs: queue a long text, then poll until it finishes. */
export class TtsJobs {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /**
     * Queues a synthesis and resolves at once with the job, whether the API
     * answers 202 (queued) or 200 (a replay of the same Idempotency-Key). The
     * body is exactly synthesize's. Poll `retrieve` until `status` is
     * `succeeded` or `failed`. The charge lands only when the job succeeds.
     */
    create(params: SynthesizeSpeechRequest, options?: IdempotentRequestOptions): APIPromise<WithRequestId<TtsJob>> {
        return this.#http.request({method: "POST", path: "/tts/jobs", body: params, retry: "idempotent", options}, readEnvelope<TtsJob>);
    }

    /** The job and where it stands: `queued`, `running`, `succeeded` or `failed`. A final state never changes. */
    retrieve(id: string, options?: RequestOptions): APIPromise<WithRequestId<TtsJob>> {
        return this.#http.request({method: "GET", path: "/tts/jobs/{id}", pathParams: {id}, retry: "safe", options}, readEnvelope<TtsJob>);
    }
}

/** Text to speech. */
export class Tts {
    /** Synthesis jobs. */
    readonly jobs: TtsJobs;

    constructor(http: HttpClient) {
        this.jobs = new TtsJobs(http);
    }
}
