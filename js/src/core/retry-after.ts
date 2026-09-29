/**
 * The seconds a `Retry-After` header asks for, or null when there is none or
 * it can't be read. The header holds either seconds or an HTTP date; a date
 * counts from `now` (milliseconds), rounded up, and never below 0.
 */
export function parseRetryAfter(value: string | null, now: number): number | null {
    if (value === null) return null;
    const text = value.trim();
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
    // An HTTP date starts with the day's name, such as "Wed, 21 Oct 2026 07:28:00 GMT".
    if (!/^[A-Za-z]{3}/.test(text)) return null;
    const date = Date.parse(text);
    return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}
