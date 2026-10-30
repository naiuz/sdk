import {expect, test} from "vitest";
import {OrbMotion, stillFrame} from "../../src/orb/motion";
import type {OrbFrame, OrbState} from "../../src/orb/motion";

const FRAME_S = 1 / 60;

/** Runs the motion for a while at 60 frames a second, returning every frame. */
function run(motion: OrbMotion, state: OrbState, level: number, seconds: number, from = 0): OrbFrame[] {
    const frames: OrbFrame[] = [];
    for (let i = 1; i <= seconds * 60; i++) frames.push(motion.step(FRAME_S, state, level, from + i * FRAME_S));
    return frames;
}

function settled(state: OrbState, level: number): OrbFrame {
    const frame = run(new OrbMotion(), state, level, 3).at(-1);
    if (frame === undefined) throw new Error("no frames");
    return frame;
}

test("speaking grows with the level", () => {
    const loud = settled("speaking", 1);
    const quiet = settled("speaking", 0);
    expect(loud.scaleY).toBeCloseTo(1.15, 2);
    expect(quiet.scaleY).toBeCloseTo(1, 2);
    expect(loud.glow).toBeCloseTo(1.1, 2);
    expect(quiet.glow).toBeCloseTo(0.25, 2);
    expect([loud.energy, quiet.energy, loud.sat]).toEqual([expect.closeTo(1, 2), expect.closeTo(0.3, 2), expect.closeTo(0.85, 2)]);
    // The colour flows faster with the voice.
    const motion = new OrbMotion();
    const before = run(motion, "speaking", 0, 1).at(-1)?.flow ?? 0;
    const quietFlow = (run(motion, "speaking", 0, 1).at(-1)?.flow ?? 0) - before;
    const loudFlow = (run(motion, "speaking", 1, 1, 2).at(-1)?.flow ?? 0) - before - quietFlow;
    expect(quietFlow).toBeCloseTo(0.25, 2);
    expect(loudFlow).toBeCloseTo(1.55, 2);
});

test("listening leans in at silence", () => {
    const frame = settled("listening", 0);
    expect(frame.scaleX).toBeCloseTo(1.045, 3);
    expect(frame.scaleY).toBeCloseTo(1.045, 3);
    expect([frame.energy, frame.sat]).toEqual([expect.closeTo(0.12, 3), expect.closeTo(0.15, 3)]);
    expect(settled("listening", 1).scaleY).toBeCloseTo(1.075, 3);
});

test("thinking swirls and circles the light", () => {
    const motion = new OrbMotion();
    const thinking = run(motion, "thinking", 0, 3);
    expect(thinking.at(-1)?.swirl).toBeCloseTo(1, 2);
    // The light orbits at 1.5 rad/s.
    expect(thinking.at(-1)?.lightA).toBeCloseTo(4.5, 3);
    // Out of thinking it eases back to its nearest full turn.
    const after = run(motion, "listening", 0, 4, 3).at(-1);
    expect(after?.lightA).toBeCloseTo(2 * Math.PI, 2);
    expect(after?.swirl).toBeCloseTo(0, 1);
});

test("idle breathes within 1.4%", () => {
    const frames = run(new OrbMotion(), "idle", 1, 8).slice(120);
    const extent = Math.max(...frames.flatMap((frame) => [Math.abs(frame.scaleX - 1), Math.abs(frame.scaleY - 1)]));
    expect(extent).toBeGreaterThan(0.01);
    expect(extent).toBeLessThanOrEqual(0.0145);
    // Connecting moves as idle does.
    expect(run(new OrbMotion(), "connecting", 1, 2).at(-1)).toEqual(run(new OrbMotion(), "idle", 1, 2).at(-1));
});

test("a still frame shows the state without motion", () => {
    expect(stillFrame("speaking")).toMatchObject({scaleX: 1, scaleY: 1, energy: 0.5, swirl: 0, sat: 0.2});
    expect(stillFrame("thinking")).toMatchObject({scaleX: 1, scaleY: 1, swirl: 1, sat: 0.2});
    expect(stillFrame("idle")).toMatchObject({energy: 0.1, swirl: 0, lightA: 0});
});
