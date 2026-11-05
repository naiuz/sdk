import {computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useWidget} from "../context";
import {followOnThisSite, isSameSite} from "../links";
import type {Quote} from "../settings";
import type {Line} from "../transcript";
import {Composer} from "./Composer";
import {Face, HeaderButton, LanguageChip} from "./Header";
import {Message} from "./Message";

/** How far from the end still counts as following the conversation. */
const FOLLOW_THRESHOLD_PX = 80;

/** The conversation: the list, fading out under the header, the composer, and what's going wrong if anything is. */
export const Chat = defineComponent({
    name: "Chat",
    emits: ["followedLink"],
    setup(_props, {emit}) {
        const {settings, colors, i18n, go, close, conversation, screen, preview, fullScreen} = useWidget();
        const {t} = i18n;
        const {transcript, failure, callProblem, fileProblem, operatorTyping, loadingLog, hasEarlier, callLive} = conversation;
        const list = ref<HTMLElement | null>(null);
        const following = ref(true);
        const replyTo = ref<Quote | null>(null);

        const samples = computed<Line[]>(() =>
            !preview
                ? []
                : [
                      {kind: "customer", key: "sample-1", text: t("preview.sample_question"), spoken: false, state: "sent", clientMessageId: null, messageId: null, attachments: [], replyTo: null, at: null},
                      {kind: "agent", key: "sample-2", eventId: 1, messageId: null, text: t("preview.sample_answer"), streaming: false, feedback: null, attachments: [], replyTo: null, at: null},
                  ],
        );
        const lines = computed(() => (preview ? samples.value : transcript.value.lines));
        const hasVisitorLine = computed(() => lines.value.some((line) => line.kind === "customer"));

        function scrollToEnd(): void {
            void nextTick(() => {
                const element = list.value;
                if (element !== null) element.scrollTop = element.scrollHeight;
            });
        }

        function onScroll(): void {
            const element = list.value;
            if (element !== null) following.value = element.scrollHeight - element.scrollTop - element.clientHeight <= FOLLOW_THRESHOLD_PX;
        }

        watch(
            () => [lines.value.length, lines.value.at(-1), transcript.value.typing, operatorTyping.value],
            () => {
                if (following.value) scrollToEnd();
            },
        );
        onMounted(scrollToEnd);

        /** A link to the site the widget is on stays on it, with the chat. A file, or any other site, opens as it does. */
        function onClick(event: MouseEvent): void {
            if (!settings.value.features.in_page_links || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            // The event's target outside the shadow root is the element itself, so it's read from here.
            const target = event.composedPath()[0];
            const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>(".markdown a[href]") : null;
            const href = anchor?.getAttribute("href") ?? "";
            if (anchor === null || !isSameSite(href, window.location.hostname)) return;
            event.preventDefault();
            emit("followedLink");
            followOnThisSite(href);
        }

        const stopWatching = watch(
            () => screen.value,
            (now) => {
                if (now === "chat") scrollToEnd();
            },
        );
        onBeforeUnmount(stopWatching);

        function quoteOf(line: Exclude<Line, {kind: "notice"}>): Quote {
            return {
                id: line.messageId ?? 0,
                sender_type: line.kind === "customer" ? "customer" : line.kind === "agent" ? "ai" : "operator",
                sender_label: line.kind === "operator" ? (line.operator.name ?? "Operator") : "",
                excerpt: line.text === "" ? null : line.text.slice(0, 140),
            };
        }

        function notice(line: Extract<Line, {kind: "notice"}>) {
            if (line.notice === "joined") {
                return (
                    <div key={line.key} class="handoff-card">
                        <span class="avatar" aria-hidden="true">
                            {line.avatarUrl === null ? (line.name ?? "•").charAt(0).toUpperCase() : <img src={line.avatarUrl} alt="" />}
                        </span>
                        <span>{line.name === null ? t("notices.joined_someone") : t("notices.joined", {name: line.name})}</span>
                    </div>
                );
            }
            return (
                <p key={line.key} class="notice">
                    {line.notice === "transferred" ? t("notices.transferred", {name: line.name ?? ""}) : t(`notices.${line.notice}`)}
                </p>
            );
        }

        return () => {
            const {texts, mode} = settings.value;
            const problem =
                failure.value === "connect"
                    ? null
                    : callProblem.value === "busy"
                      ? t("problems.busy")
                      : callProblem.value === "microphone"
                        ? t("problems.microphone")
                        : callProblem.value === "balance"
                          ? t("problems.balance")
                          : fileProblem.value !== null
                            ? fileProblem.value === "too_large"
                                ? t("attachments.too_large")
                                : fileProblem.value === "type"
                                  ? t("attachments.type")
                                  : t("attachments.failed")
                            : null;
            return (
                <div class="screen chat">
                    <header class="chat-header" style={{background: colors.value.brand, color: colors.value.onBrand}}>
                        {mode === "voice_and_text" && !callLive.value ? (
                            <HeaderButton
                                label={t("header.back")}
                                icon="back"
                                onClick={() => {
                                    screen.value = "home";
                                }}
                            />
                        ) : null}
                        <Face size={36} />
                        <div class="chat-title">
                            <h2 class="title">{texts.title}</h2>
                            <p class="subtitle">{t("header.assistant")}</p>
                        </div>
                        <LanguageChip />
                        {mode !== "text" && !callLive.value ? (
                            <HeaderButton
                                label={t("header.call")}
                                icon="phone"
                                onClick={() => {
                                    go("call");
                                }}
                            />
                        ) : null}
                        <HeaderButton label={t("header.close")} icon="x" onClick={close} />
                    </header>
                    {callLive.value ? (
                        <button
                            type="button"
                            class="back-to-call"
                            onClick={() => {
                                screen.value = "call";
                            }}
                        >
                            {t("call.back_to_call")}
                        </button>
                    ) : null}
                    <div ref={list} class="chat-list" role="log" aria-live="polite" onScroll={onScroll} onClick={onClick}>
                        {hasEarlier.value ? (
                            <button
                                type="button"
                                class="earlier"
                                onClick={() => {
                                    following.value = false;
                                    void conversation.loadEarlier();
                                }}
                            >
                                {t("messages.earlier")}
                            </button>
                        ) : null}
                        {loadingLog.value && lines.value.length === 0 ? <p class="notice">{t("messages.loading")}</p> : null}
                        {!loadingLog.value && lines.value.length === 0 && texts.welcome !== null ? (
                            <div class="message">
                                <div class="message-body">
                                    <div class="bubble">{texts.welcome}</div>
                                </div>
                            </div>
                        ) : null}
                        {lines.value.map((line) =>
                            line.kind === "notice" ? (
                                notice(line)
                            ) : (
                                <Message
                                    key={line.key}
                                    line={line}
                                    onReply={(chosen: Exclude<Line, {kind: "notice"}>) => {
                                        replyTo.value = quoteOf(chosen);
                                    }}
                                />
                            ),
                        )}
                        {transcript.value.typing ? (
                            <div class="message" aria-label={t("messages.agent_typing")}>
                                <div class="bubble typing">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                            </div>
                        ) : null}
                        {operatorTyping.value === null ? null : <p class="notice typing-name">{t("messages.typing", {name: operatorTyping.value.name ?? t("sender.operator")})}</p>}
                    </div>
                    {!hasVisitorLine.value && texts.suggested_questions.length > 0 && !preview ? (
                        <div class="suggestions suggestions-chat" role="group" aria-label={t("suggestions.label")}>
                            {texts.suggested_questions.map((question) => (
                                <button
                                    key={question}
                                    type="button"
                                    class="suggestion"
                                    onClick={() => {
                                        void conversation.send(question);
                                    }}
                                >
                                    <span>{question}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {failure.value === "connect" ? (
                        <div class="problem-row">
                            <span>{t("problems.connect")}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    void conversation.startChat();
                                }}
                            >
                                {t("problems.try_again")}
                            </button>
                        </div>
                    ) : problem === null ? null : (
                        <p class="problem">{problem}</p>
                    )}
                    <Composer
                        replyTo={replyTo.value}
                        onClearReply={() => {
                            replyTo.value = null;
                        }}
                        onSent={() => {
                            following.value = true;
                            scrollToEnd();
                        }}
                    />
                    {fullScreen.value ? null : <p class="attribution attribution-chat">{t("footer.powered_by")}</p>}
                </div>
            );
        };
    },
});
