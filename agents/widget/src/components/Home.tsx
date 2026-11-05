import {defineComponent, h} from "vue";
import {useWidget} from "../context";
import {Face, HeaderButton, LanguageChip} from "./Header";
import {Icon} from "./Icon";

/** What a visitor sees first when voice is on: who this is, how to reach them, and what others ask. */
export const Home = defineComponent({
    name: "Home",
    setup() {
        const {settings, colors, orbColors, i18n, go, close, conversation} = useWidget();
        const {t} = i18n;
        return () => {
            const {texts, last_message: last} = settings.value;
            const orb = orbColors.value;
            return (
                <div class="screen home">
                    <header class="home-header" style={{background: colors.value.brand, color: colors.value.onBrand}}>
                        <div class="home-bar">
                            <h2 class="title">{texts.title}</h2>
                            <LanguageChip />
                            <HeaderButton label={t("header.close")} icon="x" onClick={close} />
                        </div>
                        <div class="home-greeting">
                            <span class="home-face">
                                <Face size={56} />
                                <span class="online-dot" title={t("home.online")} />
                            </span>
                            <div class="home-words">
                                {texts.welcome === null ? null : <p class="greeting">{texts.welcome}</p>}
                                {texts.subtitle === null ? null : <p class="greeting-more">{texts.subtitle}</p>}
                            </div>
                        </div>
                    </header>
                    <div class="home-body">
                        <div class="home-actions">
                            <button
                                type="button"
                                class="home-action home-action-call"
                                style={{background: colors.value.brand, color: colors.value.onBrand}}
                                onClick={() => {
                                    go("call");
                                }}
                            >
                                <span class="orb-still orb-small" style={{"--orb-1": orb[0], "--orb-2": orb[1]}} />
                                <span class="home-action-words">
                                    <strong>{t("home.call")}</strong>
                                    <span>{t("home.call_hint")}</span>
                                </span>
                                <Icon name="phone" size={18} />
                            </button>
                            <button
                                type="button"
                                class="home-action"
                                onClick={() => {
                                    go("chat");
                                }}
                            >
                                <span class="home-action-icon">
                                    <Icon name="message" size={18} />
                                </span>
                                <span class="home-action-words">
                                    <strong>{t("home.message")}</strong>
                                    <span>{t("home.message_hint")}</span>
                                </span>
                                <Icon name="forward" size={18} />
                            </button>
                        </div>
                        {conversation.failure.value === "connect" ? <p class="problem">{t("problems.connect")}</p> : null}
                        {texts.suggested_questions.length === 0 ? null : (
                            <div class="suggestions" role="group" aria-label={t("suggestions.label")}>
                                {texts.suggested_questions.map((question) => (
                                    <button
                                        key={question}
                                        type="button"
                                        class="suggestion"
                                        onClick={() => {
                                            go("chat", question);
                                        }}
                                    >
                                        <span>{question}</span>
                                        <Icon name="forward" size={16} />
                                    </button>
                                ))}
                            </div>
                        )}
                        {last === null ? null : (
                            <button
                                type="button"
                                class="last-conversation"
                                onClick={() => {
                                    go("chat");
                                }}
                            >
                                <span class="last-conversation-words">
                                    <strong>{t("home.last")}</strong>
                                    <span>{last.excerpt}</span>
                                </span>
                                <Icon name="forward" size={16} />
                            </button>
                        )}
                    </div>
                    <p class="attribution">{t("footer.powered_by")}</p>
                </div>
            );
        };
    },
});
