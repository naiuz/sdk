import {onBeforeUnmount, onMounted} from "vue";
import type {Ref} from "vue";
import {isLocale} from "./i18n";
import type {WidgetI18n} from "./i18n";
import type {WidgetSettings} from "./settings";

const PREFIX = "neuron-widget:preview:";
const STATES = ["launcher", "welcome", "terms", "contact", "chat", "call"] as const;

export type PreviewState = (typeof STATES)[number];

function isState(value: unknown): value is PreviewState {
    return STATES.includes(value as PreviewState);
}

function isSettings(value: unknown): value is WidgetSettings {
    return value !== null && typeof value === "object" && typeof (value as WidgetSettings).branding === "object" && typeof (value as WidgetSettings).texts === "object";
}

/**
 * The widget's side of the channel page's preview, in the frame that page holds: it takes the unsaved settings, the state
 * to show, the language and the device, and says when it's ready. Only from its parent, on its own origin.
 */
export function usePreviewBridge(options: {
    settings: Ref<WidgetSettings | null>;
    state: Ref<PreviewState | null>;
    fullScreen: Ref<boolean>;
    i18n: WidgetI18n;
}): void {
    const {origin} = window.location;

    function onMessage(event: MessageEvent): void {
        const data = event.data as {type?: unknown; payload?: unknown} | null;
        if (event.origin !== origin || event.source !== window.parent || typeof data?.type !== "string" || !data.type.startsWith(PREFIX)) return;
        const {payload} = data;
        switch (data.type.slice(PREFIX.length)) {
            case "settings":
                if (isSettings(payload)) options.settings.value = payload;
                break;
            case "state":
                if (isState(payload)) options.state.value = payload;
                break;
            case "locale":
                if (isLocale(payload)) options.i18n.locale.value = payload;
                break;
            case "device":
                options.fullScreen.value = payload === "phone";
                break;
        }
    }

    onMounted(() => {
        window.addEventListener("message", onMessage);
        window.parent.postMessage({type: `${PREFIX}ready`}, origin);
    });
    onBeforeUnmount(() => {
        window.removeEventListener("message", onMessage);
    });
}
