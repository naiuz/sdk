import {defineComponent, h} from "vue";
import {useWidget} from "../context";
import {isSafeLink} from "../links";
import {HeaderButton} from "./Header";

/** A short screen before the first call or message, with the policy link and Accept. */
export const Terms = defineComponent({
    name: "Terms",
    emits: ["accept"],
    setup(_props, {emit}) {
        const {settings, colors, i18n, close} = useWidget();
        const {t} = i18n;
        return () => {
            const {terms, texts} = settings.value;
            const url = terms?.url ?? null;
            return (
                <div class="screen form-screen">
                    <header class="chat-header" style={{background: colors.value.brand, color: colors.value.onBrand}}>
                        <div class="chat-title">
                            <h2 class="title">{texts.title}</h2>
                        </div>
                        <HeaderButton label={t("header.close")} icon="x" onClick={close} />
                    </header>
                    <div class="form-body">
                        <h3 class="form-title">{t("terms.title")}</h3>
                        <p class="form-text">{terms?.text ?? t("terms.default")}</p>
                        {url !== null && isSafeLink(url) ? (
                            <a class="form-link" href={url} target="_blank" rel="noopener noreferrer">
                                {t("terms.link")}
                            </a>
                        ) : null}
                        <button
                            type="button"
                            class="primary-button"
                            style={{background: colors.value.brand, color: colors.value.onBrand}}
                            onClick={() => {
                                emit("accept");
                            }}
                        >
                            {t("terms.accept")}
                        </button>
                    </div>
                </div>
            );
        };
    },
});
