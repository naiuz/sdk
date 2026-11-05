import {ref} from "vue";
import type {Ref} from "vue";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uz from "./locales/uz.json";
import type {Locale} from "./settings";

const DICTIONARIES: Record<Locale, unknown> = {en, ru, uz};

const UZBEK_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

export function isLocale(value: unknown): value is Locale {
    return value === "uz" || value === "ru" || value === "en";
}

/** The language a page asks for, or its own, or the browser's. */
export function resolveLocale(requested: string | null | undefined, stored: string | null, documentLanguage: string, browserLanguages: readonly string[]): Locale | null {
    for (const candidate of [requested, stored, documentLanguage, ...browserLanguages]) {
        const language = candidate?.trim().toLowerCase().split("-")[0];
        if (isLocale(language)) return language;
    }
    return null;
}

function lookup(dictionary: unknown, key: string): string | null {
    const value = key.split(".").reduce<unknown>((node, part) => (node !== null && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), dictionary);
    return typeof value === "string" ? value : null;
}

export interface WidgetI18n {
    locale: Ref<Locale>;
    t: (key: string, params?: Record<string, string | number>) => string;
    formatTime: (value: string | null) => string;
}

export function createI18n(initial: Locale): WidgetI18n {
    const locale = ref<Locale>(initial);
    return {
        locale,
        t(key, params = {}) {
            const template = lookup(DICTIONARIES[locale.value], key) ?? lookup(en, key) ?? key;
            return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
        },
        formatTime(value) {
            const date = value === null ? null : new Date(value);
            if (date === null || Number.isNaN(date.getTime())) return "";
            const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
            // Browsers ship no Uzbek month names.
            if (locale.value === "uz") return `${String(date.getDate())}-${UZBEK_MONTHS[date.getMonth()] ?? ""}, ${time}`;
            return `${new Intl.DateTimeFormat(locale.value, {day: "numeric", month: "short"}).format(date)}, ${time}`;
        },
    };
}
