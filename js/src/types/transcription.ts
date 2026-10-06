import type {Uploadable} from "./uploads";

/** A language transcription takes, by its code. */
export type TranscriptionLanguage = "uz" | "ru" | "en" | "kk" | "tk" | "tg" | "tr" | "az" | "ja" | "de" | "ko" | (string & {});

/** Audio to transcribe, sent as multipart/form-data. */
export interface CreateTranscriptionRequest {
    /** The audio: MP3, WAV, OGG, FLAC, M4A or WebM, at most 25 MB. */
    file: Uploadable;
    /** The language spoken in it. */
    language: TranscriptionLanguage;
}

/** A timed piece of the text. */
export interface TranscriptionSegment {
    /** Where the piece starts in the audio, in seconds. */
    start: number;
    /** Where it ends, in seconds. */
    end: number;
    /** What was said. */
    text: string;
}

/** A transcription: the text, the language, the duration, timed segments, the price and your balance after the charge. */
export interface Transcription {
    /** The text of the whole audio. */
    text: string;
    /** The language's code. */
    language: string;
    /** The audio's duration, in seconds. The price is set by it, at the per-minute rate. */
    duration_seconds: number;
    /** The text in timed pieces, in order: where each starts and ends in the audio, in seconds, and what was said. */
    segments: TranscriptionSegment[];
    /** The price billed, in credits. */
    cost: number;
    /** Your balance after the charge, in credits. */
    balance: number;
}
