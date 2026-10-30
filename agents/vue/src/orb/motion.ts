/** What the orb shows. Connecting moves as idle does. */
export type OrbState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

/** One frame of the orb: its squash and stretch, its glow, and the shader's inputs. */
export interface OrbFrame {
    scaleX: number;
    scaleY: number;
    glow: number;
    flow: number;
    rot: number;
    energy: number;
    swirl: number;
    sat: number;
    lightA: number;
}

interface Spring {
    x: number;
    v: number;
}

/** The longest step a frame takes, so a tab that slept doesn't jolt the springs. */
const MAX_STEP_S = 0.05;
const TURN = Math.PI * 2;

/** Moves a spring towards its target: stiffness k, damping c. */
function spring(s: Spring, target: number, dt: number, k: number, c: number): number {
    s.v += (-k * (s.x - target) - c * s.v) * dt;
    s.x += s.v * dt;
    return s.x;
}

/**
 * The orb's motion, on springs, as the approved demo moves it: speaking grows and brightens with the voice, listening
 * leans in and follows the voice coming in, thinking swirls the colour and circles the light, idle breathes.
 */
export class OrbMotion {
    private readonly scale: Spring = {x: 1, v: 0};
    private readonly glow: Spring = {x: 0.2, v: 0};
    private readonly energy: Spring = {x: 0, v: 0};
    private readonly swirl: Spring = {x: 0, v: 0};
    private readonly sat: Spring = {x: 0, v: 0};
    private flow = 0;
    private rot = 0;
    private lightA = 0;

    /** Steps dt seconds, at time t in seconds, with the voice's level from 0 to 1. */
    step(dt: number, state: OrbState, level: number, t: number): OrbFrame {
        const step = Math.min(MAX_STEP_S, Math.max(0, dt));
        const voice = Math.min(1, Math.max(0, level));
        let scale = 1;
        let glow = 0.18;
        let energy = 0;
        let swirl = 0;
        let sat = 0;
        let rotSpeed = 0.1;
        let flowSpeed = 0.07;
        if (state === "idle" || state === "connecting") {
            scale = 1 + 0.014 * Math.sin(t * 1.25);
            glow = 0.14 + 0.05 * Math.sin(t * 1.25);
        } else if (state === "listening") {
            scale = 1.045 + 0.03 * voice;
            glow = 0.22 + 0.35 * voice;
            energy = 0.12 + 0.35 * voice;
            sat = 0.15;
            rotSpeed = 0.16;
            flowSpeed = 0.14 + 0.25 * voice;
        } else if (state === "thinking") {
            scale = 0.955 + 0.012 * Math.sin(t * 2.4);
            glow = 0.2 + 0.08 * Math.sin(t * 2.4);
            energy = 0.12;
            swirl = 1;
            sat = 0.12;
            rotSpeed = 0.55;
            flowSpeed = 0.3;
        } else {
            scale = 1 + 0.15 * voice;
            glow = 0.25 + 0.85 * voice;
            energy = 0.3 + 0.7 * voice;
            sat = 0.4 + 0.45 * voice;
            rotSpeed = 0.25 + 0.5 * voice;
            flowSpeed = 0.25 + 1.3 * voice;
        }
        if (state === "thinking") {
            this.lightA += step * 1.5;
        } else {
            // Out of thinking, the light eases back to its nearest full turn.
            this.lightA += (Math.round(this.lightA / TURN) * TURN - this.lightA) * Math.min(1, step * 2.5);
        }
        spring(this.scale, scale, step, 340, 17);
        spring(this.glow, glow, step, 90, 15);
        spring(this.energy, energy, step, 120, 16);
        spring(this.swirl, swirl, step, 18, 8);
        spring(this.sat, sat, step, 60, 14);
        this.flow += step * flowSpeed;
        this.rot += step * rotSpeed;
        const squash = Math.max(-0.04, Math.min(0.04, this.scale.v * 0.012));
        return {
            scaleX: this.scale.x * (1 - squash * 0.6),
            scaleY: this.scale.x * (1 + squash),
            glow: Math.max(0, this.glow.x),
            flow: this.flow,
            rot: this.rot,
            energy: Math.max(0, this.energy.x),
            swirl: this.swirl.x,
            sat: Math.max(0, this.sat.x),
            lightA: this.lightA,
        };
    }
}

/** The one frame shown under reduced motion: the state, without motion. */
export function stillFrame(state: OrbState): OrbFrame {
    return {
        scaleX: 1,
        scaleY: 1,
        glow: 0.15,
        flow: 0,
        rot: 0,
        energy: state === "speaking" ? 0.5 : 0.1,
        swirl: state === "thinking" ? 1 : 0,
        sat: 0.2,
        lightA: 0,
    };
}
