import {DEFAULT_ORB_SIZE, OrbDriver, orbLayout} from "@naiuz/agents/orb";
import type {OrbState} from "@naiuz/agents/orb";
import {defineComponent, h, nextTick, onBeforeUnmount, onMounted, shallowRef, watch} from "vue";
import type {PropType} from "vue";

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
        size: {type: Number, default: DEFAULT_ORB_SIZE},
        /** The voice's level from 0 to 1, read every frame: getOutputVolume while the agent speaks, getInputVolume while it listens. */
        level: {type: Function as PropType<() => number>, default: undefined},
    },
    setup(props) {
        const root = shallowRef<HTMLDivElement | null>(null);
        const glow = shallowRef<HTMLDivElement | null>(null);
        const canvas = shallowRef<HTMLCanvasElement | null>(null);
        const driver = new OrbDriver(
            () => props,
            () => ({root: root.value, glow: glow.value, canvas: canvas.value}),
        );

        onMounted(() => {
            driver.mount();
        });
        onBeforeUnmount(() => {
            driver.unmount();
        });
        // A new state starts the motion again, and a held frame is drawn again for a new size or colour.
        watch([() => props.state, () => props.colors, () => props.size], () => {
            void nextTick(driver.update);
        });

        return () => {
            const layout = orbLayout(props);
            return h("div", {ref: root, class: "naiuz-orb", "aria-hidden": "true", style: layout.root}, [
                h("div", {ref: glow, style: layout.glow}),
                h("canvas", {ref: canvas, width: layout.pixels, height: layout.pixels, style: layout.canvas}),
            ]);
        };
    },
});
