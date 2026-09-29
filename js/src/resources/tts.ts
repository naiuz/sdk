import type {APIPromise} from "../core/api-promise";
import {readDialogueAudio, readSpeechAudio, type DialogueAudio, type SpeechAudio} from "../core/audio";
import {checkMilliseconds, sleep, type HttpClient, type IdempotentRequestOptions, type RequestOptions} from "../core/http";
import {readEnvelope, type WithRequestId} from "../core/parse";
import {APIConnectionError, APIError, RateLimitError, WaitTimeoutError} from "../errors";
import type {SynthesizeDialogueRequest, SynthesizeSpeechRequest, TtsJob} from "../types/tts";

/** What the audio calls accept: the WAV, or an error in the API's JSON envelope. */
const AUDIO = "audio/wav, application/json";

/** The statuses a job never leaves. */
const FINAL = new Set(["succeeded", "failed"]);

/** The statuses of a poll failure that don't end the wait: the same ones the safe retry class would retry. */
const PASSING_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Whether a poll failure lets the wait continue rather than end it at once: a
 * connection failure (a timeout included), or a status in PASSING_STATUS.
 */
function isPassing(error: unknown): boolean {
    return error instanceof APIConnectionError || (error instanceof APIError && PASSING_STATUS.has(error.status));
}

/** The options of `tts.jobs.createAndWait`: a call's options, with `timeout` bounding the whole wait. */
export interface WaitOptions extends Omit<IdempotentRequestOptions, "timeout"> {
    /** Milliseconds between polls: 2000 by default. */
    pollInterval?: number;
    /**
     * Milliseconds to wait for the job to finish, counted from when it is
     * created: 600000 (10 minutes) by default. A poll that fails with a
     * connection error, a timeout, or a 429, 500, 502, 503 or 504 doesn't end
     * the wait: it is tried again at the next interval. When timeout runs
     * out, the call rejects with WaitTimeoutError, which carries the job as
     * last seen. Each request keeps the client's own timeout.
     */
    timeout?: number;
}

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

    /**
     * Creates a job, then polls it every `pollInterval` until it has
     * `succeeded` or `failed`, and resolves with it in either state: check
     * `status`, then fetch a succeeded job's WAV with `audio(job.id)`. A poll
     * that fails with a connection error, a timeout, or a 429, 500, 502, 503
     * or 504 doesn't end the wait: it is tried again at the next interval,
     * honouring a 429's Retry-After. Any other error, such as a 401, 403 or
     * 404, rejects the wait at once. When `timeout` runs out first, it
     * rejects with WaitTimeoutError, which carries the job as last seen, and
     * a poll still in flight is abandoned. The caller's `signal` stops the
     * wait at any point.
     */
    async createAndWait(params: SynthesizeSpeechRequest, options: WaitOptions = {}): Promise<WithRequestId<TtsJob>> {
        const {pollInterval = 2000, timeout = 600_000, signal, idempotencyKey, ...requestOptions} = options;
        checkMilliseconds("pollInterval", pollInterval);
        checkMilliseconds("timeout", timeout);
        let job = await this.create(params, {...requestOptions, idempotencyKey, signal});
        const deadline = Date.now() + timeout;
        let wait = pollInterval;
        while (!FINAL.has(job.status)) {
            const left = deadline - Date.now();
            if (left <= 0) throw new WaitTimeoutError(job);
            await sleep(Math.min(wait, left), signal);
            signal?.throwIfAborted();
            if (Date.now() >= deadline) throw new WaitTimeoutError(job);
            try {
                job = await this.#poll(job, deadline, requestOptions, signal);
                wait = pollInterval;
            } catch (error) {
                // The caller's own abort always wins, whatever the poll's error looks like.
                signal?.throwIfAborted();
                if (!isPassing(error)) throw error;
                wait = error instanceof RateLimitError && error.retry_after !== null ? Math.max(pollInterval, error.retry_after * 1000) : pollInterval;
            }
        }
        return job;
    }

    /** Retrieves the job once. A poll still in flight at the deadline is abandoned, and rejects with WaitTimeoutError carrying the job as it was. */
    async #poll(job: TtsJob, deadline: number, options: RequestOptions, signal: AbortSignal | undefined): Promise<WithRequestId<TtsJob>> {
        const controller = new AbortController();
        // A call rejects with its signal's reason, so the poll then rejects with this error.
        const timer = setTimeout(() => {
            controller.abort(new WaitTimeoutError(job));
        }, deadline - Date.now());
        const onAbort = (): void => {
            controller.abort(signal?.reason);
        };
        signal?.addEventListener("abort", onAbort, {once: true});
        try {
            return await this.retrieve(job.id, {...options, signal: controller.signal});
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        }
    }

    /**
     * The WAV of a job that has succeeded, with the headers synthesize sends.
     * Before that it answers 409: `job_not_finished` while the job is queued
     * or running, and `job_failed` once it has failed. The audio is kept for
     * 24 hours after the job finishes; after that it answers 410
     * `audio_expired`, raised as GoneError, so download it promptly.
     */
    audio(id: string, options?: RequestOptions): APIPromise<SpeechAudio> {
        return this.#http.request({method: "GET", path: "/tts/jobs/{id}/audio", pathParams: {id}, accept: AUDIO, retry: "safe", options}, readSpeechAudio);
    }
}

/** Text to speech. */
export class Tts {
    /** Synthesis jobs. */
    readonly jobs: TtsJobs;
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
        this.jobs = new TtsJobs(http);
    }

    /**
     * Synthesizes speech from text, and resolves with the WAV and what its
     * headers say: the price, the characters billed, your balance after the
     * charge, and more. Every call sends an Idempotency-Key, yours or a
     * generated one, the same on each retry, so a retry returns the first
     * answer instead of charging again; the same key with a different body
     * answers 409 `idempotency_conflict`. Emotion tags such as `[laughter]`
     * are acted out rather than read, and each bills as one character.
     */
    synthesize(params: SynthesizeSpeechRequest, options?: IdempotentRequestOptions): APIPromise<SpeechAudio> {
        return this.#http.request({method: "POST", path: "/tts/synthesize", body: params, accept: AUDIO, retry: "idempotent", options}, readSpeechAudio);
    }

    /**
     * Renders a multi-speaker script into one WAV file, and resolves with it,
     * its headers, and where each turn sits in it. A long script can take
     * about four and a half minutes, close to the default timeout: pass a
     * longer `timeout` for one. The Idempotency-Key works as on synthesize.
     */
    dialogue(params: SynthesizeDialogueRequest, options?: IdempotentRequestOptions): APIPromise<DialogueAudio> {
        return this.#http.request({method: "POST", path: "/tts/dialogue", body: params, accept: AUDIO, retry: "idempotent", options}, readDialogueAudio);
    }
}
