/**
 * The customer's brand colour and what sits on it. Text and icons on it take the customer's text colour; with none, white
 * down to 2.5:1, the floor NeuronAI accepts for its own orange, and slate-900 below it. Fields ring in the brand colour,
 * or slate-400 when the brand is too light to show.
 */
const DEFAULT_BRAND = "#F08600";
const WHITE = "#ffffff";
const SLATE_900 = "#0f172a";
const SLATE_400 = "#94a3b8";
const MIN_TEXT_CONTRAST = 2.5;

function rgb(hex: string): [number, number, number] | null {
    const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (match?.[1] === undefined) return null;
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number | null {
    const channels = rgb(hex);
    if (channels === null) return null;
    const [r, g, b] = channels.map((channel) => {
        const srgb = channel / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string): number {
    const a = luminance(first) ?? 0;
    const b = luminance(second) ?? 0;
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export interface BrandColors {
    brand: string;
    onBrand: string;
    ring: string;
}

export function brandColors(primary: string | null | undefined, text?: string | null): BrandColors {
    const brand = primary !== null && primary !== undefined && rgb(primary) !== null ? primary : DEFAULT_BRAND;
    const whiteReads = contrastRatio(WHITE, brand) >= MIN_TEXT_CONTRAST;
    return {
        brand,
        onBrand: text !== null && text !== undefined && rgb(text) !== null ? text : whiteReads ? WHITE : SLATE_900,
        ring: whiteReads ? brand : SLATE_400,
    };
}

/** The orb's second colour when none is chosen: the first, most of the way to white. */
export function lighterTint(hex: string): string {
    const channels = rgb(hex);
    if (channels === null) return WHITE;
    return `#${channels.map((channel) => Math.round(channel + (255 - channel) * 0.55).toString(16).padStart(2, "0")).join("")}`;
}

/** The two colours the orb flows between. */
export function orbColors(primary: string | null | undefined, first?: string | null, second?: string | null): [string, string] {
    const start = first !== null && first !== undefined && rgb(first) !== null ? first : brandColors(primary).brand;
    return [start, second !== null && second !== undefined && rgb(second) !== null ? second : lighterTint(start)];
}
