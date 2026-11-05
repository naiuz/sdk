import { type Country, UZBEKISTAN } from './countries';

/**
 * The phone field on the contact form. An Uzbek number keeps its mask,
 * +998 (__) ___-__-__, typed digit by digit with the cursor kept on the
 * digit slots; a number from anywhere else is typed after its country code.
 * Either way the widget sends it in E.164, as the server keeps it.
 */

const COUNTRY_CODE = '998';

/** A plus, the country code and the number: 8 to 15 digits in all. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export const PHONE_PREFIX = '+998 (';
export const PHONE_TEMPLATE = '+998 (__) ___-__-__';
export const PHONE_SLOTS = [6, 7, 10, 11, 12, 14, 15, 17, 18] as const;

/** The nine national digits typed so far. */
export function phoneDigits(value: string): string {
    let digits = value.replace(/\D+/g, '');

    if (digits.startsWith(COUNTRY_CODE)) {
        digits = digits.slice(COUNTRY_CODE.length);
    } else if (
        digits.length <= COUNTRY_CODE.length &&
        COUNTRY_CODE.startsWith(digits)
    ) {
        digits = '';
    } else if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    return digits.slice(0, 9);
}

export function formatPhone(value: string): string {
    const slots = phoneDigits(value).padEnd(9, '_').slice(0, 9);

    return `+${COUNTRY_CODE} (${slots.slice(0, 2)}) ${slots.slice(2, 5)}-${slots.slice(5, 7)}-${slots.slice(7, 9)}`;
}

/** Nine digits after +998, whatever the operator: a new one isn't refused. */
export function isValidPhone(value: string): boolean {
    return phoneDigits(value).length === 9;
}

/** What the field starts with for a country: the mask, or the country code. */
export function phoneStartFor(country: Country): string {
    if (country.code === UZBEKISTAN) {
        return PHONE_TEMPLATE;
    }

    return country.dial === '' ? '+' : `+${country.dial} `;
}

/** Whether the visitor typed any of the number, beyond its country code. */
export function phoneTyped(country: Country, value: string): boolean {
    if (country.code === UZBEKISTAN) {
        return phoneDigits(value) !== '';
    }

    return value.replace(/\D+/g, '').length > country.dial.length;
}

/** The number in E.164, or null when it isn't one yet. */
export function toE164(country: Country, value: string): string | null {
    if (country.code === UZBEKISTAN) {
        const digits = phoneDigits(value);

        return digits.length === 9 ? `+${COUNTRY_CODE}${digits}` : null;
    }

    const number = `+${value.replace(/\D+/g, '')}`;

    if (!E164_PATTERN.test(number)) {
        return null;
    }

    // An Uzbek number typed after Other still needs its nine digits.
    return number.startsWith(`+${COUNTRY_CODE}`) && number.length !== 13
        ? null
        : number;
}

/** Where the cursor goes after the given number of digits. */
export function cursorAfterDigits(
    formattedValue: string,
    digitCount: number,
): number {
    if (digitCount <= 0) {
        return PHONE_SLOTS[0];
    }

    if (digitCount >= PHONE_SLOTS.length) {
        return formattedValue.length;
    }

    return PHONE_SLOTS[digitCount] ?? formattedValue.length;
}

export function digitsBeforeCursor(value: string, cursor: number): number {
    return PHONE_SLOTS.filter(
        (slot) => slot < cursor && /\d/.test(value[slot] ?? ''),
    ).length;
}

export function digitsInRange(
    value: string,
    start: number,
    end: number,
): number {
    return PHONE_SLOTS.filter(
        (slot) => slot >= start && slot < end && /\d/.test(value[slot] ?? ''),
    ).length;
}

export function nearestSlot(cursor: number): number {
    return PHONE_SLOTS.reduce<number>(
        (closest, slot) =>
            Math.abs(slot - cursor) < Math.abs(closest - cursor)
                ? slot
                : closest,
        PHONE_SLOTS[0],
    );
}

/** The digits left after a delete key, and the digit the cursor sits at. */
export function removeDigits(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    inputType: string,
): { digits: string; cursorDigit: number } {
    const digits = phoneDigits(value);
    const start = digitsBeforeCursor(value, selectionStart);
    const end = digitsBeforeCursor(value, selectionEnd);

    if (selectionStart !== selectionEnd) {
        return {
            digits: digits.slice(0, start) + digits.slice(end),
            cursorDigit: start,
        };
    }

    if (inputType === 'deleteContentBackward') {
        return start === 0
            ? { digits, cursorDigit: 0 }
            : {
                  digits: digits.slice(0, start - 1) + digits.slice(start),
                  cursorDigit: start - 1,
              };
    }

    if (inputType === 'deleteContentForward') {
        return start >= digits.length
            ? { digits, cursorDigit: digits.length }
            : {
                  digits: digits.slice(0, start) + digits.slice(start + 1),
                  cursorDigit: start,
              };
    }

    return { digits, cursorDigit: start };
}
