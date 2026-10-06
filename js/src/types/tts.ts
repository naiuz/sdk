import type {SpeechLanguage} from "./shared";

/** Where a synthesis job stands. `succeeded` and `failed` are final. */
export type TtsJobStatus = "queued" | "running" | "succeeded" | "failed" | (string & {});

/** How fast, or how well, speech is synthesized. */
export type SpeechQuality = "fast" | "standard" | "high" | (string & {});

/** What to synthesize. `tts.jobs.create` takes exactly synthesize's body. */
export interface SynthesizeSpeechRequest {
    /**
     * The text to speak. Length is measured as spoken length, the same
     * measure billing uses: an emotion tag counts as one character, however
     * long its name is spelled.
     */
    text: string;
    /** The voice to speak with, up to 128 characters. */
    voice_id?: string | null;
    /** The text's language. */
    language?: SpeechLanguage | null;
    /** `fast`, `standard` or `high`. */
    quality?: SpeechQuality | null;
    /** From 0.5 to 2. */
    speed?: number | null;
}

/** One turn of a dialogue: who speaks, and what. */
export interface DialogueTurn {
    /** The voice that speaks the turn: a stock voice or one of your clones, up to 128 characters. */
    voice_id: string;
    /**
     * The turn's text. Length is measured as spoken length, the same measure
     * billing uses: an emotion tag counts as one character, however long its
     * name is spelled.
     */
    text: string;
    /** The turn's own language, over the dialogue's. */
    language?: SpeechLanguage | null;
    /** The turn's own quality, over the dialogue's: `fast`, `standard` or `high`. */
    quality?: SpeechQuality | null;
    /** The turn's own speed, over the dialogue's, from 0.5 to 2. */
    speed?: number | null;
}

/**
 * A multi-speaker script to render into one WAV file, billed per character,
 * per turn, at that turn's own rate. Over 8000 characters in all answers 413
 * `input_too_large`, and a single turn over its own limit answers 422
 * `invalid_request`.
 */
export interface SynthesizeDialogueRequest {
    /** The script: 1 to 100 turns. */
    turns: DialogueTurn[];
    /** Milliseconds of silence between turns, from 0 to 5000. */
    gap_ms?: number | null;
    /** The language of each turn that doesn't set its own. */
    language?: SpeechLanguage | null;
    /** The quality of each turn that doesn't set its own: `fast`, `standard` or `high`. */
    quality?: SpeechQuality | null;
    /** The speed of each turn that doesn't set its own, from 0.5 to 2. */
    speed?: number | null;
}

/** Why a job failed. */
export interface TtsJobError {
    /** `insufficient_balance`, `voice_unavailable`, `synthesis_failed`, `storage_failed` or `queue_timeout`. None of them is charged. */
    code: string;
    /** What went wrong, written for people. */
    message: string;
}

/**
 * A synthesis job and where it stands. A final state never changes. `cost`,
 * `balance_after`, `latency_ms` and `audio_url` are set once it has
 * `succeeded`, and `error` once it has `failed`.
 */
export interface TtsJob {
    /** The job's id. */
    id: string;
    /** `queued`, `running`, `succeeded` or `failed`. */
    status: TtsJobStatus;
    /** When the job was created (ISO 8601). */
    created_at: string;
    /** When a worker started on the job, or `null` while it is queued. */
    started_at: string | null;
    /** When the job succeeded or failed, or `null` until then. */
    finished_at: string | null;
    /** The text's spoken length, the measure billing uses. */
    character_count: number;
    /** The price, in credits, once the job has succeeded; `null` until then. */
    cost: number | null;
    /** The balance after the charge, once the job has succeeded; `null` until then. */
    balance_after: number | null;
    /** Whether the voice is one of your clones. */
    voice_custom: boolean;
    /** How long synthesis took, in milliseconds, once the job has succeeded; `null` until then. */
    latency_ms: number | null;
    /** Why the job failed, once it has failed; `null` otherwise. */
    error: TtsJobError | null;
    /** Where to download the audio once the job has succeeded; `null` until then. */
    audio_url: string | null;
}

/** Where one turn of a dialogue is in its audio, from the `X-Turns` header. Times are in seconds. */
export interface DialogueTurnTiming {
    /** The turn's position in the script, from 0. */
    index: number;
    /** The voice that spoke it. */
    voice_id: string;
    /** Where the turn starts. */
    start_s: number;
    /** Where it ends. */
    end_s: number;
    /** How long it lasts. */
    duration_s: number;
}
