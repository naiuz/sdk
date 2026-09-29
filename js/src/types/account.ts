/** The organization's remaining credit, and its prices. */
export interface Balance {
    /** The remaining credit, in `currency`. */
    balance: number;
    /** The balance written for people, such as `10 000 UZS`. */
    formatted: string;
    /** The currency, such as `UZS`. */
    currency: string;
    /** The price of one minute of transcription, in `currency`. */
    stt_price_per_minute: number;
    /** The price of one character of speech, in `currency`. */
    tts_price_per_char: number;
    /** The smallest top-up, in `currency`. */
    min_topup: number;
}

/** The query of `account.usage`. */
export interface UsageParams {
    /** How many days to count, today included: 7, 30 or 90 (30 by default). */
    days?: 7 | 30 | 90 | (number & {});
}

/** The counted window: whole days, today included. */
export interface UsagePeriod {
    /** How many days were counted. */
    days: number;
    /** The first day counted (`YYYY-MM-DD`). */
    start: string;
    /** The last day counted (`YYYY-MM-DD`): today. */
    end: string;
}

/** The whole window's requests and spend. */
export interface UsageTotal {
    /** The requests made. */
    requests: number;
    /** The spend, in UZS. */
    cost: number;
    /** The spend written for people, such as `1 250,50 UZS`. */
    formatted_cost: string;
    /** Always `UZS`. */
    currency: "UZS" | (string & {});
}

/** One service's requests and spend in the window. */
export interface UsageByService {
    /** The service's code, such as `llm`. */
    service: string;
    /** The service's name. */
    label: string;
    /** The requests made. */
    requests: number;
    /** The spend, in UZS. */
    cost: number;
}

/** One API key's requests and spend in the window. */
export interface UsageByKey {
    /** The key's `id`, as the API keys endpoints show it, or `null` for requests made from the dashboard. */
    id: string | null;
    /** The key's name. */
    name: string;
    /** The requests made. */
    requests: number;
    /** The spend, in UZS. */
    cost: number;
}

/** Spend and request counts over the last `days`, grouped by service and by API key. */
export interface Usage {
    /** The counted window: whole days, today included. */
    period: UsagePeriod;
    /** The whole window's requests and spend. */
    total: UsageTotal;
    /** One row per service used in the window, the costliest first: its code, such as `llm`, its name, and its requests and spend in UZS. */
    by_service: UsageByService[];
    /** One row per API key used in the window, the costliest first. */
    by_key: UsageByKey[];
}
