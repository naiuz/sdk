import {computed, defineComponent, h, nextTick, ref} from "vue";
import {countryFromNumber, countryOptions, findCountry, flagOf, UZBEKISTAN} from "../countries";
import {useWidget} from "../context";
import {isSafeLink} from "../links";
import {cursorAfterDigits, digitsBeforeCursor, formatPhone, phoneStartFor, phoneTyped, toE164} from "../phone";
import type {ContactDetails} from "../settings";
import {HeaderButton} from "./Header";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What a widget asks before the chat. The server has the last word, and what it says shows under the field. */
export const ContactForm = defineComponent({
    name: "ContactForm",
    props: {
        busy: {type: Boolean, default: false},
    },
    emits: ["submit"],
    setup(props, {emit}) {
        const {settings, colors, i18n, close, conversation} = useWidget();
        const {t} = i18n;
        const name = ref("");
        const country = ref(UZBEKISTAN);
        const phone = ref(phoneStartFor(findCountry(UZBEKISTAN)));
        const email = ref("");
        const consent = ref(false);
        const attempted = ref(false);
        const phoneField = ref<HTMLInputElement | null>(null);
        const countries = computed(() => countryOptions(i18n.locale.value, t("contact.country_other")));
        const chosen = computed(() => findCountry(country.value));

        function chooseCountry(code: string): void {
            country.value = code;
            phone.value = phoneStartFor(findCountry(code));
            void nextTick(() => phoneField.value?.focus());
        }

        function onPhoneInput(event: Event): void {
            const target = event.target as HTMLInputElement;
            const raw = target.value;
            const detected = countryFromNumber(raw, country.value);
            if (detected !== null && detected !== country.value) country.value = detected;
            if (country.value !== UZBEKISTAN) {
                phone.value = raw;
                return;
            }
            const before = digitsBeforeCursor(raw, target.selectionStart ?? raw.length);
            const formatted = formatPhone(raw);
            phone.value = formatted;
            target.value = formatted;
            void nextTick(() => {
                const at = cursorAfterDigits(formatted, before);
                target.setSelectionRange(at, at);
            });
        }

        const problems = computed(() => {
            const {fields, consent: asksConsent} = settings.value.contact;
            const typed = phoneTyped(chosen.value, phone.value);
            const e164 = toE164(chosen.value, phone.value);
            return {
                name: fields.name.enabled && fields.name.required && name.value.trim() === "",
                phone: fields.phone.enabled && ((fields.phone.required && !typed) || (typed && e164 === null)),
                email: fields.email.enabled && ((fields.email.required && email.value.trim() === "") || (email.value.trim() !== "" && !EMAIL.test(email.value.trim()))),
                consent: asksConsent !== null && !consent.value,
            };
        });

        function submit(): void {
            attempted.value = true;
            if (Object.values(problems.value).some(Boolean) || props.busy) return;
            const {fields, consent: asksConsent} = settings.value.contact;
            const details: ContactDetails = {
                ...(fields.name.enabled && name.value.trim() !== "" ? {name: name.value.trim()} : {}),
                ...(fields.email.enabled && email.value.trim() !== "" ? {email: email.value.trim()} : {}),
                ...(asksConsent === null ? {} : {consent: consent.value}),
            };
            const e164 = fields.phone.enabled ? toE164(chosen.value, phone.value) : null;
            emit("submit", e164 === null ? details : {...details, phone: e164});
        }

        const fieldError = (field: string) => conversation.contactErrors.value[`contact.${field}`] ?? null;

        return () => {
            const {contact, texts} = settings.value;
            const shown = attempted.value ? problems.value : {name: false, phone: false, email: false, consent: false};
            const optional = (field: "name" | "phone" | "email") => (contact.fields[field].required ? "" : ` ${t("contact.optional")}`);
            const policy = contact.consent?.privacy_policy_url ?? null;
            return (
                <div class="screen form-screen">
                    <header class="chat-header" style={{background: colors.value.brand, color: colors.value.onBrand}}>
                        <div class="chat-title">
                            <h2 class="title">{texts.title}</h2>
                        </div>
                        <HeaderButton label={t("header.close")} icon="x" onClick={close} />
                    </header>
                    <form
                        class="form-body"
                        style={{"--ring": colors.value.ring}}
                        novalidate
                        onSubmit={(event: Event) => {
                            event.preventDefault();
                            submit();
                        }}
                    >
                        <h3 class="form-title">{t("contact.title")}</h3>
                        <p class="form-text">{t("contact.description")}</p>
                        {contact.fields.name.enabled ? (
                            <label class="field">
                                <span>
                                    {t("contact.name")}
                                    {optional("name")}
                                </span>
                                <input
                                    autocomplete="name"
                                    maxlength={255}
                                    value={name.value}
                                    placeholder={t("contact.name_placeholder")}
                                    aria-invalid={shown.name || undefined}
                                    onInput={(event: Event) => {
                                        name.value = (event.target as HTMLInputElement).value;
                                    }}
                                />
                                {shown.name ? <small>{t("contact.name_required")}</small> : fieldError("name") === null ? null : <small>{fieldError("name")}</small>}
                            </label>
                        ) : null}
                        {contact.fields.phone.enabled ? (
                            <div class="field">
                                <span>
                                    {t("contact.phone")}
                                    {optional("phone")}
                                </span>
                                <div class="phone-row">
                                    <label class="country">
                                        <span aria-hidden="true">{flagOf(country.value) || "+"}</span>
                                        <select
                                            aria-label={t("contact.country")}
                                            value={country.value}
                                            onChange={(event: Event) => {
                                                chooseCountry((event.target as HTMLSelectElement).value);
                                            }}
                                        >
                                            {countries.value.map((option) => (
                                                <option key={option.code} value={option.code} selected={option.code === country.value}>
                                                    {option.name}
                                                    {option.dial === "" ? "" : ` +${option.dial}`}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <input
                                        ref={phoneField}
                                        type="tel"
                                        inputmode="tel"
                                        autocomplete="tel"
                                        value={phone.value}
                                        placeholder={country.value === UZBEKISTAN ? "+998 (__) ___-__-__" : t("contact.phone_international")}
                                        aria-label={t("contact.phone")}
                                        aria-invalid={shown.phone || undefined}
                                        onInput={onPhoneInput}
                                    />
                                </div>
                                {shown.phone ? <small>{t("contact.phone_invalid")}</small> : fieldError("phone") === null ? null : <small>{fieldError("phone")}</small>}
                            </div>
                        ) : null}
                        {contact.fields.email.enabled ? (
                            <label class="field">
                                <span>
                                    {t("contact.email")}
                                    {optional("email")}
                                </span>
                                <input
                                    type="email"
                                    autocomplete="email"
                                    maxlength={255}
                                    value={email.value}
                                    placeholder={t("contact.email_placeholder")}
                                    aria-invalid={shown.email || undefined}
                                    onInput={(event: Event) => {
                                        email.value = (event.target as HTMLInputElement).value;
                                    }}
                                />
                                {shown.email ? <small>{t("contact.email_invalid")}</small> : fieldError("email") === null ? null : <small>{fieldError("email")}</small>}
                            </label>
                        ) : null}
                        {contact.consent === null ? null : (
                            <label class="consent">
                                <input
                                    type="checkbox"
                                    checked={consent.value}
                                    onChange={(event: Event) => {
                                        consent.value = (event.target as HTMLInputElement).checked;
                                    }}
                                />
                                <span>
                                    {contact.consent.text ?? t("contact.consent_default")}{" "}
                                    {policy !== null && isSafeLink(policy) ? (
                                        <a href={policy} target="_blank" rel="noopener noreferrer">
                                            {t("contact.privacy_policy")}
                                        </a>
                                    ) : null}
                                </span>
                                {shown.consent ? <small>{t("contact.consent_required")}</small> : null}
                            </label>
                        )}
                        {conversation.failure.value === "connect" ? <p class="problem">{t("problems.connect")}</p> : null}
                        <button type="submit" class="primary-button" style={{background: colors.value.brand, color: colors.value.onBrand}} aria-busy={props.busy || undefined}>
                            {t("contact.continue")}
                        </button>
                    </form>
                </div>
            );
        };
    },
});
