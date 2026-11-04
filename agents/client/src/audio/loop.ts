/**
 * Makes a loop's seam continuous: the last of the loop fades into what comes just before its start,
 * so its final sample runs on into its first. What's before the start has to be there, and is: a
 * loop starts past an MP3's padding.
 */
export function crossfadeLoop(samples: Float32Array, start: number, end: number, fade: number): void {
    const length = Math.min(fade, start, end - start);
    for (let i = 0; i < length; i++) {
        const into = (i + 1) / length;
        const at = end - length + i;
        samples[at] = (samples[at] ?? 0) * Math.sqrt(1 - into) + (samples[start - length + i] ?? 0) * Math.sqrt(into);
    }
}
