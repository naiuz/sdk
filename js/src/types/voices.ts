import type {SpeechLanguage} from "./shared";

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
    /** The voice's category, or `null`. */
    category: string | null;
    /** The reference clip's transcript, or `null`. */
    ref_text: string | null;
    /** When the voice was created (ISO 8601), or `null`. */
    created_at: string | null;
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
