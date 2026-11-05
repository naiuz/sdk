import {defineComponent, h, ref} from "vue";
import type {PropType, VNode} from "vue";
import {useWidget} from "../context";
import {isSafeLink} from "../links";
import type {Attachment, Quote} from "../settings";
import type {AgentLine, CustomerLine, Line, OperatorLine} from "../transcript";
import {Icon} from "./Icon";
import {Markdown} from "./Markdown";

function initials(name: string | null): string {
    return (name ?? "").trim().charAt(0).toUpperCase() || "•";
}

/** A line of the conversation: the visitor's on the right in the brand colour, the agent's and operators' on the left in slate. */
export const Message = defineComponent({
    name: "Message",
    props: {
        line: {type: Object as PropType<Exclude<Line, {kind: "notice"}>>, required: true},
    },
    emits: ["reply"],
    setup(props, {emit}) {
        const {i18n, colors, settings, conversation, openImage, preview} = useWidget();
        const {t} = i18n;
        /** A touch screen has no hover: a tap on a message shows what can be done with it. */
        const actionsOpen = ref(false);
        const openable = () => ({
            onClick: () => {
                actionsOpen.value = !actionsOpen.value;
            },
        });

        function attachment(file: Attachment): VNode {
            const url = file.preview_url ?? file.download_url ?? null;
            if (file.preview_kind === "image" && url !== null && isSafeLink(url)) {
                return (
                    <button
                        key={file.id}
                        type="button"
                        class="message-image"
                        aria-label={t("messages.open_media", {name: file.file_name})}
                        onClick={() => {
                            openImage(url, file.file_name);
                        }}
                    >
                        <img src={url} alt={file.file_name} loading="lazy" />
                    </button>
                );
            }
            const content = [
                <Icon key="icon" name="file" />,
                <span key="name" class="message-file-name">
                    {file.file_name}
                </span>,
            ];
            return url !== null && isSafeLink(url) ? (
                <a key={file.id} class="message-file" href={url} download={file.file_name} target="_blank" rel="noopener noreferrer" aria-label={t("download.file", {name: file.file_name})}>
                    {content}
                    <Icon name="download" />
                </a>
            ) : (
                <div key={file.id} class="message-file">
                    {content}
                </div>
            );
        }

        function quote(quoted: Quote): VNode {
            const who = quoted.sender_type === "customer" ? t("sender.you") : quoted.sender_type === "ai" ? t("sender.ai") : quoted.sender_label !== "Operator" ? quoted.sender_label : t("sender.operator");
            return (
                <div class="message-quote">
                    <strong>{who}</strong>
                    <span>{quoted.excerpt ?? t("messages.attachment")}</span>
                </div>
            );
        }

        function replyButton(id: number | null): VNode | null {
            if (id === null || preview) return null;
            return (
                <button
                    type="button"
                    class="message-action"
                    aria-label={t("reply.action")}
                    onClick={() => {
                        emit("reply", props.line);
                    }}
                >
                    <Icon name="reply" size={14} />
                </button>
            );
        }

        function customer(line: CustomerLine): VNode {
            return (
                <div class={["message message-mine", actionsOpen.value && "message-open"]} {...openable()}>
                    <div class="message-body">
                        {replyButton(line.messageId)}
                        {line.text === "" && line.replyTo === null ? null : (
                            <div class="bubble bubble-mine" style={{background: colors.value.brand, color: colors.value.onBrand}}>
                                {line.replyTo === null ? null : quote(line.replyTo)}
                                {line.text}
                            </div>
                        )}
                    </div>
                    {line.attachments.map(attachment)}
                    {line.state === "failed" ? (
                        <div class="message-failed">
                            <span>{t("messages.not_sent")}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    void conversation.retry(line);
                                }}
                            >
                                {t("messages.retry")}
                            </button>
                        </div>
                    ) : null}
                </div>
            );
        }

        function thumbs(line: AgentLine): VNode | null {
            if (!settings.value.features.feedback || line.eventId === null || line.streaming || line.text === "") return null;
            // A thumb goes through the session, to the conversation going on.
            if (!preview && (conversation.chatStatus.value !== "connected" || (line.conversationId !== null && line.conversationId !== conversation.conversationId()))) return null;
            const thumb = (score: "like" | "dislike", icon: "thumb-up" | "thumb-down", label: string) => (
                <button
                    type="button"
                    class={["thumb", line.feedback === score && "thumb-chosen"]}
                    aria-label={label}
                    aria-pressed={line.feedback === score}
                    onClick={() => {
                        conversation.sendFeedback(line, score);
                    }}
                >
                    <Icon name={icon} size={14} />
                </button>
            );
            return (
                <div class="message-thumbs">
                    {thumb("like", "thumb-up", t("messages.like"))}
                    {thumb("dislike", "thumb-down", t("messages.dislike"))}
                </div>
            );
        }

        function agent(line: AgentLine): VNode {
            return (
                <div class={["message", actionsOpen.value && "message-open"]} {...openable()}>
                    <div class="message-body">
                        <div class="bubble">
                            {line.replyTo === null ? null : quote(line.replyTo)}
                            <Markdown text={line.text} />
                            {line.streaming ? <span class="caret" /> : null}
                        </div>
                        {replyButton(line.messageId)}
                    </div>
                    {line.attachments.map(attachment)}
                    {thumbs(line)}
                </div>
            );
        }

        function operator(line: OperatorLine): VNode {
            return (
                <div class={["message message-operator", actionsOpen.value && "message-open"]} {...openable()}>
                    <span class="avatar" aria-hidden="true">
                        {line.operator.avatar_url !== null && isSafeLink(line.operator.avatar_url) ? <img src={line.operator.avatar_url} alt="" /> : initials(line.operator.name)}
                    </span>
                    <div class="message-stack">
                        {line.operator.name === null ? null : <span class="message-name">{line.operator.name}</span>}
                        <div class="message-body">
                            <div class="bubble">
                                {line.replyTo === null ? null : quote(line.replyTo)}
                                <Markdown text={line.text} />
                            </div>
                            {replyButton(line.messageId)}
                        </div>
                        {line.attachments.map(attachment)}
                    </div>
                </div>
            );
        }

        return () => {
            const {line} = props;
            return line.kind === "customer" ? customer(line) : line.kind === "agent" ? agent(line) : operator(line);
        };
    },
});
