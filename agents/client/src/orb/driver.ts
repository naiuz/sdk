import {OrbMotion, stillFrame} from "./motion";
import type {OrbFrame, OrbState} from "./motion";
import {orbTones} from "./palette";
import type {OrbTones} from "./palette";
import {orbRenderer} from "./renderer";

const MIN_SIZE = 24;
const MAX_SIZE = 210;
export const DEFAULT_ORB_SIZE = 132;
/** Orbs this size and up draw every frame, at most every 16 ms; smaller ones every 50 ms. */
const LARGE_SIZE = 96;
/** The glow's blur at the default size; it scales with the orb, so an avatar doesn't wear a haze wider than it is. */
const GLOW_BLUR = 36;

export interface OrbProps {
    state: OrbState;
    /** A customer's two colours; NeuronAI's orange when left out. */
    colors?: readonly [string, string] | undefined;
    /** In CSS pixels, from 24 to 210. */
    size?: number | undefined;
    /** The voice's level from 0 to 1, read every frame: getOutputVolume while the agent speaks, getInputVolume while it listens. */
    level?: (() => number) | undefined;
}

export interface OrbElements {
    root: HTMLElement | null;
    glow: HTMLElement | null;
    canvas: HTMLCanvasElement | null;
}

export interface OrbLayout {
    /** The canvas's size in device pixels. */
    pixels: number;
    root: Record<string, string>;
    glow: Record<string, string>;
    canvas: Record<string, string>;
}

function clampedSize(size: number | undefined): number {
    return Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, size ?? DEFAULT_ORB_SIZE)));
}

/** What an orb renders, the same in every framework. */
export function orbLayout(props: Pick<OrbProps, "colors" | "size">): OrbLayout {
    const size = clampedSize(props.size);
    const [, main, light] = orbTones(props.colors);
    const width = `${String(size)}px`;
    // The soft tinted shadow follows the sphere's own edge, which sits inside the canvas's: a box shadow would start at
    // the canvas's edge and leave a ring of page between the two.
    const drop = Math.round(size * 0.06);
    const blur = Math.round(size * 0.1);
    return {
        pixels: Math.round(size * Math.min(globalThis.devicePixelRatio || 1, 2)),
        root: {position: "relative", width, height: width, flexShrink: "0"},
        glow: {
            position: "absolute",
            inset: "0",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${main} 0%, ${light} 45%, transparent 72%)`,
            filter: `blur(${String(Math.round((GLOW_BLUR * size) / DEFAULT_ORB_SIZE))}px)`,
            opacity: "var(--naiuz-glow-opacity, 0.2)",
            transform: "scale(var(--naiuz-glow-scale, 1.1))",
            pointerEvents: "none",
        },
        canvas: {
            position: "relative",
            display: "block",
            width,
            height: width,
            borderRadius: "50%",
            filter: `drop-shadow(0 ${String(drop)}px ${String(blur)}px ${main}66)`,
        },
    };
}

/**
 * What makes an orb move, apart from any framework: a lit sphere with its colours flowing inside, which moves with the
 * agent's state and the voice's level. It stops when it's out of view or at rest, and holds still for someone who asked
 * for less motion.
 */
export class OrbDriver {
    private readonly motion = new OrbMotion();
    private lastFrame: OrbFrame = stillFrame("idle");
    private mounted = false;
    private visible = true;
    private frameId = 0;
    private last = 0;
    private lastDraw = -Infinity;
    private observer: IntersectionObserver | null = null;
    private reducedMotion: MediaQueryList | null = null;

    constructor(
        private readonly props: () => OrbProps,
        private readonly elements: () => OrbElements,
    ) {}

    mount(): void {
        this.mounted = true;
        this.reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
        this.reducedMotion?.addEventListener("change", this.update);
        const {root} = this.elements();
        if (typeof IntersectionObserver === "function" && root !== null) {
            this.observer = new IntersectionObserver((entries) => {
                this.visible = entries.some((entry) => entry.isIntersecting);
                this.update();
            });
            this.observer.observe(root);
        }
        this.update();
    }

    unmount(): void {
        this.mounted = false;
        this.update();
        this.observer?.disconnect();
        this.observer = null;
        this.reducedMotion?.removeEventListener("change", this.update);
    }

    /** Called when the state, size or colours change: a new state starts the motion again, and a held frame draws again. */
    readonly update = (): void => {
        const moving = this.mounted && this.visible && !this.reduced() && !this.resting();
        if (moving && this.frameId === 0) {
            this.last = 0;
            this.frameId = requestAnimationFrame(this.tick);
        } else if (!moving && this.frameId !== 0) {
            cancelAnimationFrame(this.frameId);
            this.frameId = 0;
        }
        // Held still, it draws again when it would show something else: a new state, size or colour.
        if (this.mounted && !moving) this.paint(this.reduced() ? stillFrame(this.props().state) : this.lastFrame);
    };

    private reduced(): boolean {
        return this.reducedMotion?.matches === true;
    }

    /** Idle and at rest: the last frame stays on the canvas, and nothing runs until the state changes. */
    private resting(): boolean {
        const {state} = this.props();
        return (state === "idle" || state === "connecting") && this.motion.settled();
    }

    private tones(): OrbTones {
        return orbTones(this.props().colors);
    }

    private paint(frame: OrbFrame): void {
        const {canvas, glow} = this.elements();
        const ctx = canvas?.getContext("2d");
        if (!canvas || !glow || !ctx) return;
        orbRenderer().drawOrb(ctx, canvas.width, this.tones(), frame);
        canvas.style.transform = `scale(${frame.scaleX.toFixed(4)}, ${frame.scaleY.toFixed(4)})`;
        // Variables, which the render's own style leaves alone when it patches the element.
        glow.style.setProperty("--naiuz-glow-opacity", (0.12 + 0.6 * frame.glow).toFixed(3));
        glow.style.setProperty("--naiuz-glow-scale", (1.02 + 0.42 * frame.glow).toFixed(3));
    }

    private readonly tick = (now: number): void => {
        this.frameId = 0;
        const {state, size, level} = this.props();
        const dt = this.last === 0 ? 0 : (now - this.last) / 1000;
        this.last = now;
        this.lastFrame = this.motion.step(dt, state, level?.() ?? 0, now / 1000);
        const rested = this.resting();
        if (rested || now - this.lastDraw >= (clampedSize(size) >= LARGE_SIZE ? 16 : 50)) {
            this.lastDraw = now;
            this.paint(this.lastFrame);
        }
        if (!rested) this.frameId = requestAnimationFrame(this.tick);
    };
}
