/** Whether a parsed JSON value is an object, as opposed to an array, a primitive or null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
