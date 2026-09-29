import {describe, expect, it} from "vitest";
import {parseRetryAfter} from "../../src/core/retry-after";

const NOW = Date.UTC(2026, 8, 29, 10, 0, 0);

describe("parseRetryAfter", () => {
    it("reads seconds", () => {
        expect(parseRetryAfter("12", NOW)).toBe(12);
        expect(parseRetryAfter(" 0 ", NOW)).toBe(0);
        expect(parseRetryAfter("1.5", NOW)).toBe(1.5);
    });

    it("reads an HTTP date as the seconds from now, rounded up", () => {
        expect(parseRetryAfter("Tue, 29 Sep 2026 10:00:30 GMT", NOW)).toBe(30);
        expect(parseRetryAfter("Tue, 29 Sep 2026 10:00:30 GMT", NOW + 500)).toBe(30);
        expect(parseRetryAfter("Tue, 29 Sep 2026 10:30:00 GMT", NOW)).toBe(1800);
    });

    it("never gives less than 0 for a date already past", () => {
        expect(parseRetryAfter("Tue, 29 Sep 2026 09:59:00 GMT", NOW)).toBe(0);
    });

    it("gives null for no header, or one it can't read", () => {
        for (const value of [null, "", "soon", "-1", "12s", "1e3"]) expect(parseRetryAfter(value, NOW), String(value)).toBeNull();
    });
});
