import {AgentOrb} from "@naiuz/agents-vue";
import {defineComponent, h, ref, watch} from "vue";
import {useWidget} from "../context";
import {isLocale} from "../i18n";
import {isSafeLink} from "../links";
import {Icon} from "./Icon";

const FLAGS: Record<string, string> = {uz: "🇺🇿", ru: "🇷🇺", en: "🇬🇧"};

/** The agent's face: the customer's image if they set one, otherwise the orb. */
export const Face = defineComponent({
    name: "Face",
    props: {size: {type: Number, default: 40}},
    setup(props) {
        const {settings, orbColors} = useWidget();
        const failed = ref(false);
        watch(
            () => settings.value.branding.logo_url,
            () => {
                failed.value = false;
            },
        );
        return () => {
            const logo = settings.value.branding.logo_url ?? null;
            return logo !== null && !failed.value && isSafeLink(logo) ? (
                <img
                    class="face"
                    src={logo}
                    alt=""
                    width={props.size}
                    height={props.size}
                    onError={() => {
                        failed.value = true;
                    }}
                />
            ) : (
                <AgentOrb state="idle" colors={orbColors.value} size={props.size} />
            );
        };
    },
});

/** A chip with the flag and the code, when the agent has more than one language. */
export const LanguageChip = defineComponent({
    name: "LanguageChip",
    setup() {
        const {settings, i18n, chooseLanguage} = useWidget();
        return () => {
            const languages = settings.value.languages.filter(isLocale);
            if (languages.length < 2) return null;
            const current = i18n.locale.value;
            return (
                <label class="language-chip">
                    <span aria-hidden="true">
                        {FLAGS[current]} {current.toUpperCase()}
                    </span>
                    <select
                        aria-label={i18n.t("header.language")}
                        value={current}
                        onChange={(event: Event) => {
                            const chosen = (event.target as HTMLSelectElement).value;
                            if (isLocale(chosen)) chooseLanguage(chosen);
                        }}
                    >
                        {languages.map((language) => (
                            <option key={language} value={language} selected={language === current}>
                                {FLAGS[language]} {language.toUpperCase()}
                            </option>
                        ))}
                    </select>
                </label>
            );
        };
    },
});

/** A round button on the header's colour. */
export function HeaderButton(props: {label: string; icon: Parameters<typeof Icon>[0]["name"]; onClick: () => void}) {
    return (
        <button type="button" class="header-button" aria-label={props.label} onClick={props.onClick}>
            <Icon name={props.icon} size={18} />
        </button>
    );
}
