import {computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, shallowRef, watch} from "vue";
import type {PropType} from "vue";
import {OrbMotion, stillFrame} from "./motion";
import type {OrbFrame, OrbState} from "./motion";
import {orbTones} from "./palette";
import {orbRenderer} from "./renderer";

const MIN_SIZE = 24;
const MAX_SIZE = 210;
const DEFAULT_SIZE = 132;
/** Orbs this size and up draw every frame, at most every 16 ms; smaller ones every 50 ms. */
const LARGE_SIZE = 96;
/** The glow's blur at the default size; it scales with the orb, so an avatar doesn't wear a haze wider than itself. */
const GLOW_BLUR = 36;

/**
 * The agent's face: a lit sphere with its colours flowing inside, which moves with the agent's state and the voice's
 * level. It is decorative, so screen readers skip it; the state's word belongs beside it.
 */
export const AgentOrb = defineComponent({
    name: "AgentOrb",
    props: {
        state: {type: String as PropType<OrbState>, default: "idle"},
        /** A customer's two colours; NeuronAI's orange when left out. */
        colors: {type: Array as unknown as PropType<readonly [string, string]>, default: undefined},
        /** In CSS pixels, from 24 to 210. */
        size: {type: Number, default: DEFAULT_SIZE},
        /** The voice's level from 0 to 1, read every frame: getOutputVolume while the agent speaks, getInputVolume while it listens. */
        level: {type: Function as PropType<() => number>, default: undefined},
    },
    setup(props) {
        const root = shallowRef<HTMLDivElement | null>(null);
        const glow = shallowRef<HTMLDivElement | null>(null);
        const canvas = shallowRef<HTMLCanvasElement | null>(null);
        const size = computed(() => Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, props.size))));
        const tones = computed(() => orbTones(props.colors));
        const motion = new OrbMotion();
        let mounted = false;
        let visible = true;
        let frameId = 0;
        let last = 0;
        let lastDraw = -Infinity;
        let observer: IntersectionObserver | null = null;
        let reducedMotion: MediaQueryList | null = null;

        const reduced = () => reducedMotion?.matches === true;

        function paint(frame: OrbFrame): void {
            const target = canvas.value;
            const halo = glow.value;
            const ctx = target?.getContext("2d");
            if (!target || !halo || !ctx) return;
            orbRenderer().drawOrb(ctx, target.width, tones.value, frame);
            target.style.transform = `scale(${frame.scaleX.toFixed(4)}, ${frame.scaleY.toFixed(4)})`;
            halo.style.opacity = (0.12 + 0.6 * frame.glow).toFixed(3);
            halo.style.transform = `scale(${(1.02 + 0.42 * frame.glow).toFixed(3)})`;
        }

        function tick(now: number): void {
            frameId = 0;
            const dt = last === 0 ? 0 : (now - last) / 1000;
            last = now;
            const frame = motion.step(dt, props.state, props.level?.() ?? 0, now / 1000);
            if (now - lastDraw >= (size.value >= LARGE_SIZE ? 16 : 50)) {
                lastDraw = now;
                paint(frame);
            }
            frameId = requestAnimationFrame(tick);
        }

        function update(): void {
            const moving = mounted && visible && !reduced();
            if (moving && frameId === 0) {
                last = 0;
                frameId = requestAnimationFrame(tick);
            } else if (!moving && frameId !== 0) {
                cancelAnimationFrame(frameId);
                frameId = 0;
            }
            if (mounted && reduced()) paint(stillFrame(props.state));
        }

        onMounted(() => {
            mounted = true;
            reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
            reducedMotion?.addEventListener("change", update);
            if (typeof IntersectionObserver === "function" && root.value) {
                observer = new IntersectionObserver((entries) => {
                    visible = entries.some((entry) => entry.isIntersecting);
                    update();
                });
                observer.observe(root.value);
            }
            update();
        });

        onBeforeUnmount(() => {
            mounted = false;
            update();
            observer?.disconnect();
            reducedMotion?.removeEventListener("change", update);
        });

        // Under reduced motion the still frame is drawn again when it would show something else.
        watch([() => props.state, tones, size], () => {
            if (reduced()) void nextTick(update);
        });

        return () => {
            const px = Math.round(size.value * Math.min(globalThis.devicePixelRatio || 1, 2));
            const [, main, light] = tones.value;
            const width = `${String(size.value)}px`;
            // The soft tinted shadow follows the sphere's own edge, which sits inside the canvas's: a box shadow would
            // start at the canvas's edge and leave a ring of page between the two.
            const drop = Math.round(size.value * 0.06);
            const blur = Math.round(size.value * 0.1);
            return h("div", {ref: root, class: "naiuz-orb", "aria-hidden": "true", style: {position: "relative", width, height: width, flex: "none"}}, [
                h("div", {
                    ref: glow,
                    style: {
                        position: "absolute",
                        inset: "0",
                        borderRadius: "50%",
                        background: `radial-gradient(circle, ${main} 0%, ${light} 45%, transparent 72%)`,
                        filter: `blur(${String(Math.round((GLOW_BLUR * size.value) / DEFAULT_SIZE))}px)`,
                        opacity: "0.2",
                        pointerEvents: "none",
                    },
                }),
                h("canvas", {
                    ref: canvas,
                    width: px,
                    height: px,
                    style: {
                        position: "relative",
                        display: "block",
                        width,
                        height: width,
                        borderRadius: "50%",
                        filter: `drop-shadow(0 ${String(drop)}px ${String(blur)}px ${main}66)`,
                    },
                }),
            ]);
        };
    },
});
