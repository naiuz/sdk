/** The orb's four tones, deepest to lightest. */
export type OrbTones = readonly [string, string, string, string];

/** NeuronAI's own agents: four tones of the brand orange. */
export const NEURON_TONES = ["#D96F00", "#FF9A14", "#FFC56E", "#FFF3E0"] as const;

/**
 * The orb's tones: NeuronAI's, or a customer's two colours with the deepest and lightest derived from them, the main
 * colour 32% of the way to black and the second 84% of the way to white.
 */
export function orbTones(colors?: readonly [string, string]): OrbTones {
    if (colors === undefined) return NEURON_TONES;
    const [main, second] = colors;
    return [toHex(mix(rgb(main), [0, 0, 0], 0.32)), main, second, toHex(mix(rgb(second), [1, 1, 1], 0.84))];
}

/** A #rrggbb colour as three channels from 0 to 1. */
export function rgb(hex: string): [number, number, number] {
    const value = parseInt(hex.slice(1), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function mix(from: number[], to: number[], amount: number): number[] {
    return from.map((value, i) => value + ((to[i] ?? 0) - value) * amount);
}

function toHex(channels: number[]): string {
    return `#${channels.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
