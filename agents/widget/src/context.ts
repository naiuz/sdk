import {inject, provide} from "vue";
import type {ComputedRef, InjectionKey, Ref} from "vue";
import type {BrandColors} from "./brand";
import type {WidgetI18n} from "./i18n";
import type {Locale, WidgetSettings} from "./settings";
import type {WidgetConversation} from "./useWidgetConversation";

export type Screen = "home" | "chat" | "call" | "contact" | "terms";

/** What every part of the widget shares. The settings can change while it runs, on the channel page's preview. */
export interface WidgetContext {
    i18n: WidgetI18n;
    settings: Ref<WidgetSettings>;
    colors: ComputedRef<BrandColors>;
    orbColors: ComputedRef<[string, string]>;
    conversation: WidgetConversation;
    /** The channel page's preview: it shows the look, and nothing goes anywhere. */
    preview: boolean;
    fullScreen: Ref<boolean>;
    screen: Ref<Screen>;
    /** Goes through the terms and the contact form, if they're still to come, and then there. */
    go: (target: "chat" | "call", question?: string) => void;
    close: () => void;
    chooseLanguage: (locale: Locale) => void;
    openImage: (url: string, name: string) => void;
}

const KEY: InjectionKey<WidgetContext> = Symbol("neuronai-widget");

export function provideWidget(context: WidgetContext): void {
    provide(KEY, context);
}

export function useWidget(): WidgetContext {
    const context = inject(KEY);
    if (context === undefined) throw new Error("The widget's context isn't provided.");
    return context;
}
