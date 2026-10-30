import {WORKLET_MODULE} from "./worklet-module";

/**
 * The AudioWorklet module: the DSP of dsp.ts, then the capture and playback processors. It's a string built with the
 * package (scripts/worklet-module.mjs), so an app's bundler, which may rewrite the package's classes, leaves it alone.
 */
export function workletSource(): string {
    return WORKLET_MODULE;
}
