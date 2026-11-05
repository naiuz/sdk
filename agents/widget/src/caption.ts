/**
 * The live caption: what the agent has said so far, estimated from the time its reply has been playing, cut back to a
 * word's end. The protocol carries no word timings.
 */
export function captionSplit(text: string, spokenMs: number, charsPerSecond = 15): {spoken: string; rest: string} {
    const reached = Math.floor((spokenMs / 1000) * charsPerSecond);
    if (reached >= text.length) return {spoken: text, rest: ""};
    const cut = Math.max(0, text.lastIndexOf(" ", reached));
    return {spoken: text.slice(0, cut), rest: text.slice(cut)};
}

/** A call's length as m:ss, and h:mm:ss from an hour. */
export function callClock(ms: number): string {
    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours > 0 ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${seconds}` : `${String(minutes)}:${seconds}`;
}
