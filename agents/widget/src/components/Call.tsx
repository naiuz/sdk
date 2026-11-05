import {AgentOrb} from "@naiuz/agents-vue";
import {computed, defineComponent, h, onBeforeUnmount, ref, watch} from "vue";
import {callClock, captionSplit} from "../caption";
import {useWidget} from "../context";
import {lastSaid} from "../transcript";
import {HeaderButton} from "./Header";
import {Icon} from "./Icon";

/** The call: the orb in the customer's colours, the agent's state, what's being said, and Mute, Type and End. */
export const Call = defineComponent({
    name: "Call",
    setup() {
        const {settings, colors, orbColors, i18n, conversation, screen, close, go, preview} = useWidget();
        const {t} = i18n;
        const {agentMode, muted, callStartedAt, calling, callLive, callProblem, transcript} = conversation;
        const now = ref(Date.now());
        const clock = setInterval(() => {
            now.value = Date.now();
        }, 1000);

        const lastLine = computed(() => lastSaid(transcript.value));

        /** The words already spoken are dark, and the rest of the sentence light. Time stands in for word timings. */
        const spokenMs = ref(0);
        let frame: number | null = null;
        let last: number | null = null;
        function tick(at: number): void {
            if (last !== null) spokenMs.value += at - last;
            last = at;
            frame = requestAnimationFrame(tick);
        }
        function stop(): void {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            last = null;
        }
        watch(
            () => lastLine.value?.key,
            () => {
                spokenMs.value = 0;
            },
        );
        watch(
            agentMode,
            (mode) => {
                if (mode === "speaking") frame ??= requestAnimationFrame(tick);
                else {
                    stop();
                    spokenMs.value = Number.POSITIVE_INFINITY;
                }
            },
            {immediate: true},
        );
        onBeforeUnmount(() => {
            stop();
            clearInterval(clock);
        });

        const orbState = computed(() => (agentMode.value === "speaking" || agentMode.value === "listening" || agentMode.value === "thinking" ? agentMode.value : "idle"));
        const level = () => (agentMode.value === "speaking" ? conversation.getOutputVolume() : agentMode.value === "listening" ? conversation.getInputVolume() : 0);

        return () => {
            const {texts, mode} = settings.value;
            const brand = colors.value.brand;
            const live = callLive.value || preview;
            const line = preview ? null : lastLine.value;
            const parts = preview ? {spoken: t("preview.sample_spoken"), rest: ""} : line === null ? null : line.kind === "agent" ? captionSplit(line.text, spokenMs.value) : {spoken: line.text, rest: ""};
            const problem =
                callProblem.value === "microphone"
                    ? t("problems.microphone_voice")
                    : callProblem.value === "busy"
                      ? t("problems.busy_voice")
                      : callProblem.value === "balance"
                        ? t("problems.balance")
                        : callProblem.value === "failed"
                          ? t("problems.call_failed")
                          : null;
            const stateWord = calling.value
                ? t("call.connecting")
                : preview || agentMode.value === "speaking"
                  ? t("call.speaking")
                  : agentMode.value === "thinking"
                    ? t("call.thinking")
                    : live
                      ? t("call.listening")
                      : (problem ?? (conversation.callEnded.value ? t("call.ended") : null));
            return (
                <div class="screen call" style={{"--brand": brand}}>
                    <header class="call-header">
                        <div class="call-title">
                            <h2 class="title">{texts.title}</h2>
                            <p class="subtitle">
                                {t("header.call")}
                                {callStartedAt.value === null ? null : <span class="clock"> {callClock(Math.max(0, now.value - callStartedAt.value))}</span>}
                            </p>
                        </div>
                        <HeaderButton label={live ? t("header.minimize") : t("header.close")} icon={live ? "down" : "x"} onClick={close} />
                    </header>
                    <div class="call-stage">
                        <div class="call-orb">
                            <AgentOrb state={orbState.value} colors={orbColors.value} size={184} level={level} />
                        </div>
                        {stateWord === null ? null : (
                            <p class={["call-state", !live && problem !== null && "call-problem"]} aria-live="polite">
                                {stateWord}
                            </p>
                        )}
                        {parts === null ? null : (
                            <div class="caption">
                                <strong>{line?.kind === "customer" ? t("call.you") : texts.title}</strong>
                                <p>
                                    <span class="spoken">{parts.spoken}</span>
                                    <span class="to-come">{parts.rest}</span>
                                </p>
                            </div>
                        )}
                    </div>
                    {live ? (
                        <div class="call-controls">
                            <button
                                type="button"
                                class={["round-control", muted.value && "round-control-on"]}
                                aria-pressed={muted.value}
                                onClick={() => {
                                    conversation.setMuted(!muted.value);
                                }}
                            >
                                <Icon name={muted.value ? "mic-off" : "mic"} size={20} />
                                <span>{muted.value ? t("call.unmute") : t("call.mute")}</span>
                            </button>
                            {mode === "voice" ? null : (
                                <button
                                    type="button"
                                    class="round-control"
                                    onClick={() => {
                                        screen.value = "chat";
                                    }}
                                >
                                    <Icon name="keyboard" size={20} />
                                    <span>{t("call.type")}</span>
                                </button>
                            )}
                            <button
                                type="button"
                                class="end-button"
                                onClick={() => {
                                    void conversation.endCall();
                                }}
                            >
                                {t("call.end")}
                            </button>
                        </div>
                    ) : (
                        <div class="call-controls">
                            <button
                                type="button"
                                class="primary-button"
                                style={{background: brand, color: colors.value.onBrand}}
                                disabled={calling.value}
                                aria-busy={calling.value}
                                onClick={() => {
                                    go("call");
                                }}
                            >
                                {conversation.callEnded.value ? t("call.again") : t("call.start")}
                            </button>
                        </div>
                    )}
                </div>
            );
        };
    },
});
