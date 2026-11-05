import type {ClientToolHandler} from "@naiuz/agents";
import {computed, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch} from "vue";
import type {PropType, Ref} from "vue";
import {DEFAULT_API_URL, WidgetApi, WidgetApiError} from "./api";
import type {WidgetIdentity} from "./api";
import {brandColors, orbColors as orbColorsOf} from "./brand";
import {Call} from "./components/Call";
import {Chat} from "./components/Chat";
import {ContactForm} from "./components/ContactForm";
import {Home} from "./components/Home";
import {Icon} from "./components/Icon";
import {Launcher} from "./components/Launcher";
import {Terms} from "./components/Terms";
import {provideWidget} from "./context";
import type {Screen} from "./context";
import {createI18n, isLocale, resolveLocale} from "./i18n";
import {usePreviewBridge} from "./preview";
import type {PreviewState} from "./preview";
import type {ContactDetails, Locale, WidgetSettings} from "./settings";
import {createChime} from "./sound";
import {createStorage} from "./storage";
import {useWidgetConversation} from "./useWidgetConversation";

let defaultApiUrl = DEFAULT_API_URL;

export function setDefaultApiUrl(url: string): void {
    defaultApiUrl = url;
}

function parseVariables(json: string | undefined): Record<string, string | number | boolean> | undefined {
    if (json === undefined || json === "") return undefined;
    try {
        const parsed = JSON.parse(json) as unknown;
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string | number | boolean>) : undefined;
    } catch {
        console.warn("[neuronai-agent] dynamic-variables isn't JSON, so it was left out.");
        return undefined;
    }
}

/**
 * The widget. It starts as the launcher, and opens into a panel in the corner, or the whole screen on a phone. On the
 * channel page's preview it shows the state the admin picks, and nothing goes anywhere.
 */
export const App = defineComponent({
    name: "NeuronaiAgent",
    props: {
        agentId: {type: String, default: undefined},
        widgetKey: {type: String, default: undefined},
        apiUrl: {type: String, default: undefined},
        lang: {type: String, default: undefined},
        /** On the widget's own test page: its chats show in the inbox as tests. */
        test: {type: Boolean, default: false},
        preview: {type: Boolean, default: false},
        /** Values for the agent's variables, as JSON. */
        dynamicVariables: {type: String, default: undefined},
        /** The client tools this page runs, set as a property. */
        clientTools: {type: Object as PropType<Record<string, ClientToolHandler>>, default: undefined},
    },
    setup(props) {
        const identity: WidgetIdentity | null = props.widgetKey !== undefined ? {widgetKey: props.widgetKey} : props.agentId !== undefined ? {agentId: props.agentId} : null;
        if (identity === null && !props.preview) console.warn("[neuronai-agent] It needs a widget-key or an agent-id.");

        const storage = createStorage(props.widgetKey ?? props.agentId ?? "preview");
        const api = new WidgetApi(props.apiUrl ?? defaultApiUrl, identity ?? {widgetKey: ""});
        const requested = resolveLocale(props.lang, storage.language(), document.documentElement.lang, navigator.languages);
        const i18n = createI18n(requested ?? "uz");
        const settings = shallowRef<WidgetSettings | null>(null);
        const isOpen = ref(false);
        const screen = ref<Screen>("home");
        const invited = ref(true);
        const image = ref<{url: string; name: string} | null>(null);
        const phone = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 480px)") : null;
        const fullScreen = ref(phone?.matches ?? false);
        const panel = ref<HTMLElement | null>(null);
        const busy = ref(false);
        const chime = createChime(() => settings.value?.features.sound ?? false);

        const conversation = useWidgetConversation({
            api,
            storage,
            hasVisitor: props.widgetKey !== undefined,
            settings,
            locale: i18n.locale,
            test: props.test,
            preview: props.preview,
            isOpen,
            clientTools: () => props.clientTools,
            dynamicVariables: () => parseVariables(props.dynamicVariables),
            onChime: () => {
                chime.chime();
            },
        });

        const colors = computed(() => brandColors(settings.value?.branding.primary_color, settings.value?.branding.text_color));
        const orbColors = computed(() => orbColorsOf(settings.value?.branding.primary_color, settings.value?.branding.orb_color, settings.value?.branding.orb_color_2));

        let pending: {target: "chat" | "call"; question: string | undefined} = {target: "chat", question: undefined};
        let opened = false;

        function firstScreen(): void {
            const mode = settings.value?.mode;
            if (mode === "text") go("chat");
            else screen.value = mode === "voice" ? "call" : "home";
        }

        function needsTerms(): boolean {
            return settings.value?.terms !== null && settings.value?.terms !== undefined && !storage.termsAccepted();
        }

        function needsContact(): boolean {
            return settings.value?.contact.mode === "before_chat" && storage.visitorToken() === null;
        }

        function enter(): void {
            const {target, question} = pending;
            screen.value = target;
            if (target === "call") void conversation.startCall();
            else if (question !== undefined) void conversation.send(question);
            else void conversation.startChat();
        }

        function go(target: "chat" | "call", question?: string): void {
            pending = {target, question};
            if (props.preview) screen.value = target;
            else if (needsTerms()) screen.value = "terms";
            else if (needsContact()) screen.value = "contact";
            else enter();
        }

        function acceptTerms(): void {
            storage.acceptTerms();
            go(pending.target, pending.question);
        }

        async function submitContact(details: ContactDetails): Promise<void> {
            if (busy.value) return;
            busy.value = true;
            const started = await conversation.startChat(details);
            busy.value = false;
            if (started) enter();
        }

        function open(): void {
            isOpen.value = true;
            invited.value = false;
            if (!opened) {
                opened = true;
                firstScreen();
            }
        }

        function close(): void {
            isOpen.value = false;
        }

        // A call that can't be goes on as text, where there is text.
        watch(conversation.callProblem, (problem) => {
            if (problem !== null && problem !== "failed" && settings.value?.mode !== "voice") screen.value = "chat";
        });
        watch(conversation.callEnded, (ended) => {
            if (ended && (conversation.handedOffInCall.value || settings.value?.mode !== "voice")) screen.value = "chat";
        });

        async function load(language: Locale | null): Promise<void> {
            try {
                const found = await api.settings(language, storage.visitorToken());
                settings.value = found;
                if (found !== null) {
                    i18n.locale.value = language ?? found.locale;
                    conversation.unread.value = isOpen.value ? 0 : found.unread;
                }
            } catch (error) {
                if (error instanceof WidgetApiError && error.code === "origin_not_allowed") {
                    console.warn(`[neuronai-agent] ${error.message}`);
                }
                settings.value = null;
            }
        }

        function chooseLanguage(locale: Locale): void {
            storage.setLanguage(locale);
            i18n.locale.value = locale;
            if (!props.preview) void load(locale).then(() => conversation.languageChanged());
        }

        const previewState = ref<PreviewState | null>(null);
        if (props.preview) {
            usePreviewBridge({settings: settings, state: previewState, fullScreen, i18n});
            watch(previewState, (state) => {
                if (state === null) return;
                isOpen.value = state !== "launcher";
                if (state === "welcome") {
                    const mode = settings.value?.mode;
                    screen.value = mode === "text" ? "chat" : mode === "voice" ? "call" : "home";
                } else if (state !== "launcher") {
                    screen.value = state;
                }
            });
        }

        const onPhoneChange = (event: MediaQueryListEvent) => {
            fullScreen.value = event.matches;
        };

        /** A phone's open panel fills the screen, and the page behind it stays where it was. */
        let pageOverflow: string | null = null;
        watch(
            () => isOpen.value && fullScreen.value && !props.preview,
            (locked) => {
                const page = document.documentElement;
                if (locked) {
                    pageOverflow = page.style.overflow;
                    page.style.overflow = "hidden";
                } else if (pageOverflow !== null) {
                    page.style.overflow = pageOverflow;
                    pageOverflow = null;
                }
            },
        );

        onMounted(async () => {
            phone?.addEventListener("change", onPhoneChange);
            if (props.preview || identity === null) return;
            await load(requested);
            if (settings.value !== null && storage.takeResumeOpen()) open();
        });

        onBeforeUnmount(() => {
            phone?.removeEventListener("change", onPhoneChange);
            chime.dispose();
            if (pageOverflow !== null) document.documentElement.style.overflow = pageOverflow;
        });

        provideWidget({
            i18n,
            settings: settings as Ref<WidgetSettings>,
            colors,
            orbColors,
            conversation,
            preview: props.preview,
            fullScreen,
            screen,
            go,
            close,
            chooseLanguage,
            openImage: (url, name) => {
                image.value = {url, name};
            },
        });

        return () => {
            const current = settings.value;
            if (current === null) return null;
            const onLeft = current.branding.position === "bottom-left";
            const [orbOne, orbTwo] = orbColors.value;
            return (
                <div
                    class="root"
                    lang={isLocale(i18n.locale.value) ? i18n.locale.value : undefined}
                    style={{"--brand": colors.value.brand, "--on-brand": colors.value.onBrand, "--ring": colors.value.ring, "--orb-1": orbOne, "--orb-2": orbTwo}}
                >
                    {isOpen.value ? null : <Launcher unread={conversation.unread.value} invite={invited.value} onOpen={open} />}
                    {isOpen.value ? (
                        <section
                            ref={panel}
                            class={["panel", onLeft && "panel-left", fullScreen.value && "panel-full"]}
                            role="dialog"
                            aria-label={current.texts.title}
                            onKeydown={(event: KeyboardEvent) => {
                                if (event.key !== "Escape") return;
                                if (image.value !== null) image.value = null;
                                else close();
                            }}
                        >
                            {screen.value === "home" ? <Home /> : null}
                            {screen.value === "chat" ? (
                                <Chat
                                    onFollowedLink={() => {
                                        // The next page is for reading: a phone's open chat would cover it.
                                        if (fullScreen.value) close();
                                        else storage.setResumeOpen();
                                    }}
                                />
                            ) : null}
                            {screen.value === "call" ? <Call /> : null}
                            {screen.value === "terms" ? <Terms onAccept={acceptTerms} /> : null}
                            {screen.value === "contact" ? <ContactForm busy={busy.value} onSubmit={(details: ContactDetails) => void submitContact(details)} /> : null}
                            {image.value === null ? null : (
                                <div class="lightbox">
                                    <button
                                        type="button"
                                        class="header-button lightbox-close"
                                        aria-label={i18n.t("header.close")}
                                        onClick={() => {
                                            image.value = null;
                                        }}
                                    >
                                        <Icon name="x" size={18} />
                                    </button>
                                    <img src={image.value.url} alt={image.value.name} />
                                </div>
                            )}
                        </section>
                    ) : null}
                </div>
            );
        };
    },
});
