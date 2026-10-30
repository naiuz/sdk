import {expect, test} from "vitest";
import {stillFrame} from "../../src/orb/motion";
import {NEURON_TONES} from "../../src/orb/palette";
import {orbRenderer} from "../../src/orb/renderer";

type Call = [string, ...unknown[]];

/** A WebGL context that records its calls: every method answers, its program always links, and it's lost when told. */
function fakeWebGl(calls: Call[], state: {lost: boolean}): WebGLRenderingContext {
    const constants: Record<string, number> = {VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, STATIC_DRAW: 4, LINK_STATUS: 5, FLOAT: 6, COLOR_BUFFER_BIT: 7, TRIANGLE_STRIP: 8};
    return new Proxy({}, {
        get: (_, name: string) => constants[name] ?? ((...args: unknown[]) => {
            calls.push([name, ...args]);
            if (name === "isContextLost") return state.lost;
            return name === "getProgramParameter" ? true : {name};
        }),
    }) as WebGLRenderingContext;
}

/** The offscreen canvases the renderer makes: each records its contexts and can lose its WebGL. */
function canvases(webgl: boolean) {
    const made: {canvas: HTMLCanvasElement; contexts: string[]; gl: Call[]; state: {lost: boolean}; fire: (type: string) => void}[] = [];
    const make = () => {
        const contexts: string[] = [];
        const gl: Call[] = [];
        const state = {lost: false};
        const listeners = new Map<string, ((event: {preventDefault(): void}) => void)[]>();
        const canvas = {
            width: 0,
            height: 0,
            getContext: (kind: string) => {
                contexts.push(kind);
                return webgl && kind === "webgl" ? fakeWebGl(gl, state) : null;
            },
            addEventListener: (type: string, listener: (event: {preventDefault(): void}) => void) => {
                listeners.set(type, [...(listeners.get(type) ?? []), listener]);
            },
        } as unknown as HTMLCanvasElement;
        const fire = (type: string) => {
            for (const listener of listeners.get(type) ?? []) listener({preventDefault: () => undefined});
        };
        made.push({canvas, contexts, gl, state, fire});
        return canvas;
    };
    return {make, made};
}

/** An orb's own 2D canvas context, recording what is drawn on it. */
function surface() {
    const calls: Call[] = [];
    const stops: [number, string][] = [];
    const ctx = new Proxy({}, {
        get: (_, name: string) => (...args: unknown[]) => {
            calls.push([name, ...args]);
            if (name === "createRadialGradient") return {addColorStop: (at: number, color: string) => stops.push([at, color])};
            return undefined;
        },
        set: (_, name: string, value: unknown) => {
            calls.push([`set ${name}`, value]);
            return true;
        },
    }) as CanvasRenderingContext2D;
    return {ctx, calls, stops};
}

test("one WebGL context draws every orb", () => {
    const {make, made} = canvases(true);
    const renderer = orbRenderer(make);
    const orbs = [surface(), surface(), surface()];
    orbs.forEach((orb, i) => {
        renderer.drawOrb(orb.ctx, [264, 64, 48][i] ?? 0, NEURON_TONES, stillFrame("speaking"));
    });
    expect(made).toHaveLength(1);
    expect(made[0]?.contexts).toEqual(["webgl"]);
    expect(made[0]?.gl.filter(([name]) => name === "drawArrays")).toHaveLength(3);
    // Each orb copies its square, from the bottom of the shared canvas, into its own.
    expect(orbs.map((orb) => orb.calls.find(([name]) => name === "drawImage"))).toEqual([
        ["drawImage", made[0]?.canvas, 0, 0, 264, 264, 0, 0, 264, 264],
        ["drawImage", made[0]?.canvas, 0, 200, 64, 64, 0, 0, 64, 64],
        ["drawImage", made[0]?.canvas, 0, 216, 48, 48, 0, 0, 48, 48],
    ]);
    expect(orbRenderer(make)).toBe(renderer);
});

test("without WebGL the orb is a gradient, not a blank circle", () => {
    const {make} = canvases(false);
    const orb = surface();
    orbRenderer(make).drawOrb(orb.ctx, 100, NEURON_TONES, stillFrame("idle"));
    expect(orb.calls.find(([name]) => name === "createRadialGradient")).toEqual(["createRadialGradient", 36, 30, 5, 50, 50, 50]);
    expect(orb.stops).toEqual([[0, "#FFF3E0"], [0.45, "#FFC56E"], [0.8, "#FF9A14"], [1, "#D96F00"]]);
    expect(orb.calls.find(([name]) => name === "arc")).toEqual(["arc", 50, 50, 48.5, 0, Math.PI * 2]);
    expect(orb.calls.some(([name]) => name === "fill")).toBe(true);
});

test("a context lost before its event arrives draws the gradient, not a blank square", () => {
    const {make, made} = canvases(true);
    const renderer = orbRenderer(make);
    renderer.drawOrb(surface().ctx, 64, NEURON_TONES, stillFrame("idle"));
    const state = made[0]?.state;
    if (state) state.lost = true;
    const orb = surface();
    renderer.drawOrb(orb.ctx, 64, NEURON_TONES, stillFrame("idle"));
    expect(orb.calls.some(([name]) => name === "createRadialGradient")).toBe(true);
    expect(orb.calls.some(([name]) => name === "drawImage")).toBe(false);
});

test("a lost context falls back to the gradient, and a restored one draws the sphere again", () => {
    const {make, made} = canvases(true);
    const renderer = orbRenderer(make);
    const before = surface();
    renderer.drawOrb(before.ctx, 64, NEURON_TONES, stillFrame("idle"));
    made[0]?.fire("webglcontextlost");
    const lost = surface();
    renderer.drawOrb(lost.ctx, 64, NEURON_TONES, stillFrame("idle"));
    expect(lost.calls.some(([name]) => name === "createRadialGradient")).toBe(true);
    expect(lost.calls.some(([name]) => name === "drawImage")).toBe(false);
    made[0]?.fire("webglcontextrestored");
    const restored = surface();
    renderer.drawOrb(restored.ctx, 64, NEURON_TONES, stillFrame("idle"));
    expect(restored.calls.some(([name]) => name === "drawImage")).toBe(true);
});
