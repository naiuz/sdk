import {h} from "vue";
import {renderToString} from "vue/server-renderer";
import {expect, test} from "vitest";
import {AgentOrb} from "../../src/index";

test("the orb is hidden from screen readers", async () => {
    const html = await renderToString(h(AgentOrb, {state: "speaking"}));
    expect(html).toMatch(/^<div class="naiuz-orb" aria-hidden="true"/);
    expect(html).toContain("<canvas");
});

test("its size is clamped to 24 to 210 px", async () => {
    const sizes = async (size: number) => {
        const html = await renderToString(h(AgentOrb, {size}));
        return [html.match(/^<div[^>]*style="[^"]*width:(\d+)px/)?.[1], html.match(/<canvas width="(\d+)"/)?.[1]];
    };
    expect(await sizes(10)).toEqual(["24", "24"]);
    expect(await sizes(132)).toEqual(["132", "132"]);
    expect(await sizes(500)).toEqual(["210", "210"]);
    expect((await renderToString(h(AgentOrb))).match(/width:(\d+)px/)?.[1]).toBe("132");
});

test("the glow wears the orb's tones", async () => {
    const neuron = await renderToString(h(AgentOrb));
    expect(neuron).toContain("radial-gradient(circle, #FF9A14 0%, #FFC56E 45%, transparent 72%)");
    expect(neuron).toContain("blur(36px)");
    const custom = await renderToString(h(AgentOrb, {colors: ["#0ea5e9", "#a5f3fc"]}));
    expect(custom).toContain("radial-gradient(circle, #0ea5e9 0%, #a5f3fc 45%, transparent 72%)");
});

test("it has no ring", async () => {
    const html = await renderToString(h(AgentOrb, {state: "listening", size: 64}));
    // Rounded, but with no border, outline or box shadow around it: a box shadow starts at the canvas's edge, not
    // the sphere's, and the gap between them reads as a ring.
    expect(html).not.toMatch(/border(?!-radius)|outline|box-shadow/);
    // Its one shadow follows the sphere's own edge, soft and tinted.
    expect(html).toMatch(/filter:drop-shadow\(0 4px 6px #FF9A1466\)/);
});
