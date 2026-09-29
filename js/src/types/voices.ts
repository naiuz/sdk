import type {SpeechLanguage} from "./shared";
import type {Uploadable} from "./uploads";

/** What a voice is for. */
export type VoiceCategory = "conversational" | "narration" | "characters" | "social_media" | "educational" | (string & {});

/** `stock` for the catalog's voices, `custom` for your organization's voice clones. */
export type VoiceType = "custom" | "stock" | (string & {});

/** A stock voice, or one of your organization's voice clones. */
export interface Voice {
    /** The voice's id: pass it as `voice_id`. */
    id: string;
    /** The voice's name. */
    name: string;
    /** The code of the language the voice speaks. */
    language: string;
    /** The voice's tags: always a list. */
    tags: string[];
    /** `stock` or `custom`. */
    type: VoiceType;
    /** The voice's category, or `null`; the API may leave it out. */
    category?: string | null;
    /** The reference clip's transcript, or `null`; the API may leave it out. */
    ref_text?: string | null;
    /** When the voice was created (ISO 8601), or `null`; the API may leave it out. */
    created_at?: string | null;
}

/** The query of `voices.list`. */
export interface ListVoicesParams {
    /** `stock` or `custom` narrows the list to that type. */
    type?: VoiceType | null;
    /** Only voices in this language. */
    language?: string | null;
    /** Voices per page, from 1 to 100 (50 by default). */
    limit?: number | null;
    /** A page's `next_cursor`, to start from the page after it. Cursors are opaque: don't build them. */
    cursor?: string | null;
}

/**
 * The fields to change; every one is optional, and an omitted field is left
 * alone. A new reference clip goes through `POST /v1/tts/voices/{id}/audio`
 * instead. Changing the language or the transcript re-creates the voice on
 * the voice service.
 */
export interface UpdateVoiceRequest {
    /** The new name, up to 120 characters. */
    name?: string;
    /** The new category. */
    category?: VoiceCategory;
    /** The new language. Changing it re-creates the voice. */
    language?: SpeechLanguage;
    /** The new transcript, up to 1000 characters. `null` or `""` clears it. Changing it re-creates the voice. */
    ref_text?: string | null;
    /** The new tags, up to 32 characters each. `null` or `[]` clears them, and blank tags are dropped. */
    tags?: string[] | null;
}

/**
 * A voice clone to create, sent as multipart/form-data: its name, its
 * language and a reference clip, and optionally the clip's transcript, tags
 * and category.
 */
export interface CreateVoiceRequest {
    /** The voice's name, up to 120 characters. */
    name: string;
    /** The language the voice speaks. */
    language: SpeechLanguage;
    /** A 10–15 second reference clip: WAV, MP3, OGG or FLAC, at most 10 MB. */
    ref_audio: Uploadable;
    /** What the clip says, up to 1000 characters. */
    ref_text?: string | null;
    /** What the voice is for. */
    category?: VoiceCategory;
    /** Tags, up to 32 characters each, each sent as its own `tags[]` field. Blank tags are dropped. */
    tags?: string[] | null;
}

/** A voice clone's new reference clip, sent as multipart/form-data, and optionally its transcript. */
export interface ReplaceVoiceAudioRequest {
    /** The new reference clip, in the formats and size a new clone takes: WAV, MP3, OGG or FLAC, at most 10 MB. */
    ref_audio: Uploadable;
    /** What the new clip says, up to 1000 characters. */
    ref_text?: string | null;
}
