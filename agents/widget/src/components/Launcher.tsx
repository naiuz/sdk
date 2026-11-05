import {computed, defineComponent, h, onBeforeUnmount, ref, watch} from "vue";
import {useWidget} from "../context";
import {Icon, isIconName} from "./Icon";

const DEFAULT_TIMING = {style: "fade", delay: 0, duration: null, repeats: 1} as const;

/**
 * The launcher on the customer's site, 72px in the brand colour, and when there is one the launcher message beside it. The
 * message waits, comes in, stays and leaves as often as the settings say, and doesn't go from under a pointer. A count says
 * what came while the panel was shut: the launcher never bounces or pulses for attention.
 */
export const Launcher = defineComponent({
    name: "Launcher",
    props: {
        unread: {type: Number, default: 0},
        /** False once the visitor has opened the chat on this page. */
        invite: {type: Boolean, default: true},
    },
    emits: ["open"],
    setup(props, {emit}) {
        const {settings, colors, i18n} = useWidget();
        const shown = ref(false);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let shows = 0;
        let held = false;
        let due = false;

        const message = computed(() => settings.value.texts.launcher_label);
        const timing = computed(() => settings.value.branding.launcher_message ?? DEFAULT_TIMING);

        function wait(): void {
            timer = setTimeout(show, timing.value.delay * 1000);
        }
        function show(): void {
            shown.value = true;
            shows += 1;
            if (timing.value.duration !== null) timer = setTimeout(hide, timing.value.duration * 1000);
        }
        function hide(): void {
            if (held) {
                due = true;
                return;
            }
            due = false;
            shown.value = false;
            if (shows < timing.value.repeats) wait();
        }
        watch(
            [() => JSON.stringify(timing.value), () => Boolean(message.value), () => props.invite],
            () => {
                clearTimeout(timer);
                shown.value = false;
                shows = 0;
                due = false;
                if (message.value !== null && props.invite) wait();
            },
            {immediate: true},
        );
        onBeforeUnmount(() => {
            clearTimeout(timer);
        });

        return () => {
            const icon = settings.value.branding.bubble_icon ?? "default";
            const onLeft = settings.value.branding.position === "bottom-left";
            const name = settings.value.texts.title;
            return (
                <div class={["launcher", onLeft && "launcher-left"]}>
                    {message.value !== null && shown.value ? (
                        <button
                            type="button"
                            class={["launcher-message", `enter-${timing.value.style}`]}
                            onClick={() => {
                                emit("open");
                            }}
                            onPointerenter={() => {
                                held = true;
                            }}
                            onPointerleave={() => {
                                held = false;
                                if (due) hide();
                            }}
                        >
                            {message.value}
                        </button>
                    ) : null}
                    <div class="launcher-button-wrap">
                        <button
                            type="button"
                            class="launcher-button"
                            style={{background: colors.value.brand, color: settings.value.branding.icon_color ?? colors.value.onBrand}}
                            aria-label={[i18n.t("launcher.open", {name}), props.unread > 0 ? i18n.t("launcher.unread", {count: props.unread}) : ""].join(" ").trim()}
                            onClick={() => {
                                emit("open");
                            }}
                        >
                            {icon === "orb" ? <span class="orb-still" /> : <Icon name={isIconName(icon) ? icon : "default"} size={28} />}
                        </button>
                        {props.unread > 0 ? (
                            <span class="launcher-badge" aria-hidden="true">
                                {props.unread > 9 ? "9+" : props.unread}
                            </span>
                        ) : null}
                    </div>
                </div>
            );
        };
    },
});
