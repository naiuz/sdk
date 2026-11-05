import {defineComponent, Fragment, h, ref} from "vue";
import type {PropType} from "vue";
import {useWidget} from "../context";
import type {Quote} from "../settings";
import {Icon} from "./Icon";

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt";

/** Where the visitor writes: a file if the widget takes them, the message it answers if they chose one, and Send. */
export const Composer = defineComponent({
    name: "Composer",
    props: {
        replyTo: {type: Object as PropType<Quote | null>, default: null},
    },
    emits: ["clearReply", "sent"],
    setup(props, {emit}) {
        const {i18n, settings, colors, conversation, preview} = useWidget();
        const {t} = i18n;
        const text = ref("");
        const field = ref<HTMLTextAreaElement | null>(null);
        const fileInput = ref<HTMLInputElement | null>(null);

        function submit(): void {
            if (preview || text.value.trim() === "") return;
            void conversation.send(text.value, props.replyTo);
            text.value = "";
            if (field.value !== null) field.value.style.height = "";
            emit("clearReply");
            emit("sent");
        }

        function onInput(event: Event): void {
            const target = event.target as HTMLTextAreaElement;
            text.value = target.value;
            // Grows with what's written, up to a few lines.
            target.style.height = "auto";
            target.style.height = `${String(Math.min(target.scrollHeight, 120))}px`;
            conversation.sendUserActivity();
        }

        function onFile(event: Event): void {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = "";
            if (file === undefined || preview) return;
            const caption = text.value.trim();
            void conversation.sendFile(file, caption === "" ? null : caption, props.replyTo);
            text.value = "";
            emit("clearReply");
            emit("sent");
        }

        return () => (
            <form
                class="composer"
                onSubmit={(event: Event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                {props.replyTo === null ? null : (
                    <div class="composer-reply">
                        <span>{props.replyTo.excerpt ?? t("messages.attachment")}</span>
                        <button
                            type="button"
                            aria-label={t("reply.cancel")}
                            onClick={() => {
                                emit("clearReply");
                            }}
                        >
                            <Icon name="x" size={14} />
                        </button>
                    </div>
                )}
                <div class="composer-row" style={{"--ring": colors.value.ring}}>
                    {settings.value.features.attachments ? (
                        <>
                            <input ref={fileInput} type="file" accept={ACCEPTED} hidden onChange={onFile} />
                            <button
                                type="button"
                                class="icon-button"
                                aria-label={t("attachments.attach")}
                                onClick={() => {
                                    fileInput.value?.click();
                                }}
                            >
                                <Icon name="clip" size={18} />
                            </button>
                        </>
                    ) : null}
                    <textarea
                        ref={field}
                        rows={1}
                        maxlength={10000}
                        value={text.value}
                        placeholder={t("composer.placeholder")}
                        aria-label={t("composer.placeholder")}
                        onInput={onInput}
                        onKeydown={(event: KeyboardEvent) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <button type="submit" class="send-button" style={{background: colors.value.brand, color: colors.value.onBrand}} aria-label={t("composer.send")} disabled={text.value.trim() === ""}>
                        <Icon name="send" size={18} />
                    </button>
                </div>
            </form>
        );
    },
});
