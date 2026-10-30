import {expect, test} from "vitest";
import {NEURON_TONES, orbTones} from "../../src/orb/palette";

test("NeuronAI's agents wear the four brand tones", () => {
    expect(NEURON_TONES).toEqual(["#D96F00", "#FF9A14", "#FFC56E", "#FFF3E0"]);
    expect(orbTones()).toEqual(NEURON_TONES);
});

test("a customer's two colours derive the deepest and lightest tones", () => {
    // The demo's formula: the main colour 32% of the way to black, the second 84% of the way to white.
    expect(orbTones(["#0ea5e9", "#a5f3fc"])).toEqual(["#0a709e", "#0ea5e9", "#a5f3fc", "#f1fdff"]);
    expect(orbTones(["#7C3AED", "#C4B5FD"])).toEqual(["#5427a1", "#7C3AED", "#C4B5FD", "#f6f3ff"]);
});
