import {checkMaxRetries, checkTimeout, type Fetch, HttpClient} from "./core/http";
import {globalFetch, isBrowser, readEnv, userAgent} from "./core/runtime";
import {NeuronAIError} from "./errors";
import {Account} from "./resources/account";
import {Tts} from "./resources/tts";
import {Voices} from "./resources/voices";

/** The API's address when neither `baseURL` nor NEURONAI_BASE_URL gives one. */
export const DEFAULT_BASE_URL = "https://my.neuronai.uz/api/v1";
/** Milliseconds each attempt may take by default: 5 minutes. */
export const DEFAULT_TIMEOUT = 300_000;
/** How many times a failed attempt is retried by default. */
export const DEFAULT_MAX_RETRIES = 2;

/** The options of `new NeuronAI(...)`. */
export interface ClientOptions {
    /** Your API key (`nai_…`). Defaults to the NEURONAI_API_KEY environment variable. */
    apiKey?: string;
    /** The API's address. Defaults to NEURONAI_BASE_URL, then to `https://my.neuronai.uz/api/v1`. */
    baseURL?: string;
    /**
     * Milliseconds each attempt may take, reading the response included:
     * 300000 (5 minutes) by default. A long dialogue, or a voice update that
     * re-creates the voice, can take longer: pass a longer per-call `timeout`.
     */
    timeout?: number;
    /** How many times a failed attempt may be retried: 2 by default. */
    maxRetries?: number;
    /** Headers sent with every call. */
    defaultHeaders?: Record<string, string>;
    /** A fetch implementation, for tests and proxies. Defaults to the global `fetch`. */
    fetch?: Fetch;
    /** Allows construction in a browser page, where the API key is exposed to anyone who opens it. False by default. */
    dangerouslyAllowBrowser?: boolean;
}

// Visible ASCII: what a key can be. A space or a line break inside it would break the Authorization header.
const KEY_CHARACTERS = /^[\x21-\x7E]+$/;

function checkBaseURL(value: string): string {
    const base = value.trim().replace(/\/+$/, "");
    let protocol = "";
    try {
        protocol = new URL(base).protocol;
    } catch {
        // Not a URL: refused below.
    }
    if (protocol !== "https:" && protocol !== "http:") throw new NeuronAIError(`baseURL must be an http or https URL, not "${base}".`);
    return base;
}

/** The NeuronAI API client. */
export class NeuronAI {
    /** The API's address, without a trailing slash. */
    readonly baseURL: string;
    /** Milliseconds each attempt may take, unless a call passes its own `timeout`. */
    readonly timeout: number;
    /** How many times a failed attempt is retried, unless a call passes its own `maxRetries`. */
    readonly maxRetries: number;
    /** Your organization's balance and usage. */
    readonly account: Account;
    /** Stock voices and your voice clones. */
    readonly voices: Voices;
    /** Text to speech. */
    readonly tts: Tts;

    /**
     * Throws NeuronAIError at once when there is no API key, when an option
     * is invalid, or in a browser page without `dangerouslyAllowBrowser`.
     */
    constructor(options: ClientOptions = {}) {
        if (options.dangerouslyAllowBrowser !== true && isBrowser()) {
            throw new NeuronAIError(
                "NeuronAI won't run in a browser, where your API key would be exposed to anyone who opens the page. Call the API from your server, or pass dangerouslyAllowBrowser: true if you accept that risk.",
            );
        }
        const apiKey = (options.apiKey ?? readEnv("NEURONAI_API_KEY") ?? "").trim();
        if (apiKey === "") throw new NeuronAIError("The API key is missing: pass it as new NeuronAI({ apiKey }), or set NEURONAI_API_KEY.");
        // Refuse without quoting the key: fetch's own header error would print it whole.
        if (!KEY_CHARACTERS.test(apiKey)) throw new NeuronAIError("The API key contains a space, a line break or another character a header can't carry. Check how it was copied.");
        this.baseURL = checkBaseURL(options.baseURL ?? readEnv("NEURONAI_BASE_URL") ?? DEFAULT_BASE_URL);
        this.timeout = checkTimeout(options.timeout ?? DEFAULT_TIMEOUT);
        this.maxRetries = checkMaxRetries(options.maxRetries ?? DEFAULT_MAX_RETRIES);
        const fetchImpl = options.fetch ?? globalFetch();
        if (typeof fetchImpl !== "function") throw new NeuronAIError("There is no global fetch here: pass one as the fetch option.");
        const http = new HttpClient({
            apiKey,
            baseURL: this.baseURL,
            timeout: this.timeout,
            maxRetries: this.maxRetries,
            defaultHeaders: {...options.defaultHeaders},
            userAgent: userAgent(),
            fetch: fetchImpl,
        });
        this.account = new Account(http);
        this.voices = new Voices(http);
        this.tts = new Tts(http);
    }
}
