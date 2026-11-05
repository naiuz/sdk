/**
 * The countries the phone field offers (channels-technical-planning.md,
 * Contact capture): a static list of dial codes, Uzbekistan first, then the
 * region and the countries visitors most often write from. Names come from
 * the browser in the visitor's language, and from UZBEK_NAMES in Uzbek,
 * which browsers can't name; anyone else picks "Other" and types the whole
 * number with its country code.
 */

const isWrittenByHand = (locale: string): boolean => locale === 'uz';

export type Country = {
    /** ISO 3166-1 alpha-2, or OTHER. */
    code: string;
    /** Without the plus; empty for Other. */
    dial: string;
};

export const UZBEKISTAN = 'UZ';
export const OTHER_COUNTRY = 'OTHER';

const COUNTRIES: Country[] = [
    { code: 'UZ', dial: '998' },
    { code: 'KZ', dial: '7' },
    { code: 'KG', dial: '996' },
    { code: 'TJ', dial: '992' },
    { code: 'TM', dial: '993' },
    { code: 'RU', dial: '7' },
    { code: 'AF', dial: '93' },
    { code: 'AE', dial: '971' },
    { code: 'AM', dial: '374' },
    { code: 'AR', dial: '54' },
    { code: 'AT', dial: '43' },
    { code: 'AU', dial: '61' },
    { code: 'AZ', dial: '994' },
    { code: 'BD', dial: '880' },
    { code: 'BE', dial: '32' },
    { code: 'BG', dial: '359' },
    { code: 'BH', dial: '973' },
    { code: 'BR', dial: '55' },
    { code: 'BY', dial: '375' },
    { code: 'CA', dial: '1' },
    { code: 'CH', dial: '41' },
    { code: 'CN', dial: '86' },
    { code: 'CZ', dial: '420' },
    { code: 'DE', dial: '49' },
    { code: 'DK', dial: '45' },
    { code: 'EE', dial: '372' },
    { code: 'EG', dial: '20' },
    { code: 'ES', dial: '34' },
    { code: 'FI', dial: '358' },
    { code: 'FR', dial: '33' },
    { code: 'GB', dial: '44' },
    { code: 'GE', dial: '995' },
    { code: 'GR', dial: '30' },
    { code: 'HK', dial: '852' },
    { code: 'HU', dial: '36' },
    { code: 'ID', dial: '62' },
    { code: 'IE', dial: '353' },
    { code: 'IL', dial: '972' },
    { code: 'IN', dial: '91' },
    { code: 'IQ', dial: '964' },
    { code: 'IR', dial: '98' },
    { code: 'IT', dial: '39' },
    { code: 'JO', dial: '962' },
    { code: 'JP', dial: '81' },
    { code: 'KR', dial: '82' },
    { code: 'KW', dial: '965' },
    { code: 'LT', dial: '370' },
    { code: 'LV', dial: '371' },
    { code: 'MA', dial: '212' },
    { code: 'MD', dial: '373' },
    { code: 'MN', dial: '976' },
    { code: 'MX', dial: '52' },
    { code: 'MY', dial: '60' },
    { code: 'NG', dial: '234' },
    { code: 'NL', dial: '31' },
    { code: 'NO', dial: '47' },
    { code: 'NZ', dial: '64' },
    { code: 'OM', dial: '968' },
    { code: 'PH', dial: '63' },
    { code: 'PK', dial: '92' },
    { code: 'PL', dial: '48' },
    { code: 'PT', dial: '351' },
    { code: 'QA', dial: '974' },
    { code: 'RO', dial: '40' },
    { code: 'SA', dial: '966' },
    { code: 'SE', dial: '46' },
    { code: 'SG', dial: '65' },
    { code: 'TH', dial: '66' },
    { code: 'TR', dial: '90' },
    { code: 'UA', dial: '380' },
    { code: 'US', dial: '1' },
    { code: 'VN', dial: '84' },
    { code: 'ZA', dial: '27' },
];

/**
 * Every country above in Uzbek. Chrome lists Uzbek as supported, then names
 * regions in English (see lib/localeFormat.ts).
 */
const UZBEK_NAMES: Record<string, string> = {
    AE: 'Birlashgan Arab Amirliklari',
    AF: 'Afgʻoniston',
    AM: 'Armaniston',
    AR: 'Argentina',
    AT: 'Avstriya',
    AU: 'Avstraliya',
    AZ: 'Ozarbayjon',
    BD: 'Bangladesh',
    BE: 'Belgiya',
    BG: 'Bolgariya',
    BH: 'Bahrayn',
    BR: 'Braziliya',
    BY: 'Belarus',
    CA: 'Kanada',
    CH: 'Shveytsariya',
    CN: 'Xitoy',
    CZ: 'Chexiya',
    DE: 'Germaniya',
    DK: 'Daniya',
    EE: 'Estoniya',
    EG: 'Misr',
    ES: 'Ispaniya',
    FI: 'Finlandiya',
    FR: 'Fransiya',
    GB: 'Buyuk Britaniya',
    GE: 'Gruziya',
    GR: 'Gretsiya',
    HK: 'Gonkong',
    HU: 'Vengriya',
    ID: 'Indoneziya',
    IE: 'Irlandiya',
    IL: 'Isroil',
    IN: 'Hindiston',
    IQ: 'Iroq',
    IR: 'Eron',
    IT: 'Italiya',
    JO: 'Iordaniya',
    JP: 'Yaponiya',
    KG: 'Qirgʻiziston',
    KR: 'Janubiy Koreya',
    KW: 'Quvayt',
    KZ: 'Qozogʻiston',
    LT: 'Litva',
    LV: 'Latviya',
    MA: 'Marokash',
    MD: 'Moldova',
    MN: 'Moʻgʻuliston',
    MX: 'Meksika',
    MY: 'Malayziya',
    NG: 'Nigeriya',
    NL: 'Niderlandiya',
    NO: 'Norvegiya',
    NZ: 'Yangi Zelandiya',
    OM: 'Ummon',
    PH: 'Filippin',
    PK: 'Pokiston',
    PL: 'Polsha',
    PT: 'Portugaliya',
    QA: 'Qatar',
    RO: 'Ruminiya',
    RU: 'Rossiya',
    SA: 'Saudiya Arabistoni',
    SE: 'Shvetsiya',
    SG: 'Singapur',
    TH: 'Tailand',
    TJ: 'Tojikiston',
    TM: 'Turkmaniston',
    TR: 'Turkiya',
    UA: 'Ukraina',
    US: 'Amerika Qoʻshma Shtatlari',
    UZ: 'Oʻzbekiston',
    VN: 'Vyetnam',
    ZA: 'Janubiy Afrika Respublikasi',
};

/** How many of the countries lead the list, ahead of the alphabet. */
const LEADING = 6;

export function findCountry(code: string): Country {
    return (
        COUNTRIES.find((country) => country.code === code) ?? {
            code: OTHER_COUNTRY,
            dial: '',
        }
    );
}

/**
 * The country a number typed with its code belongs to, so +7… or +998…
 * picks its country by itself. No code starts another, except the two that
 * countries share: +7 is Kazakhstan when a 6 or 7 follows and Russia
 * otherwise, and +1 stays Canada when that's the choice and is the United
 * States otherwise. Other when no code fits; null when there is no plus.
 */
export function countryFromNumber(
    value: string,
    current: string,
): string | null {
    const typed = value.trimStart();

    if (!typed.startsWith('+')) {
        return null;
    }

    const digits = typed.replace(/\D+/g, '');
    const match = COUNTRIES.find((country) => digits.startsWith(country.dial));

    if (!match) {
        return OTHER_COUNTRY;
    }

    if (match.dial === '7') {
        if (digits.length === 1) {
            return current === 'KZ' ? 'KZ' : 'RU';
        }

        return /^7[67]/.test(digits) ? 'KZ' : 'RU';
    }

    if (match.dial === '1') {
        return current === 'CA' ? 'CA' : 'US';
    }

    return match.code;
}

/** The country's flag, from its code; nothing for Other. */
export function flagOf(code: string): string {
    if (!/^[A-Z]{2}$/.test(code)) {
        return '';
    }

    return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);
}

/**
 * The countries with their names in the visitor's language: the region
 * first, the rest by name, and Other last.
 */
export function countryOptions(
    locale: string,
    otherLabel: string,
): Array<Country & { name: string }> {
    let names: Intl.DisplayNames | null = null;

    try {
        names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
    } catch {
        // An old browser: the codes stand in for the names.
    }

    const nameOf = (code: string): string =>
        (isWrittenByHand(locale) ? UZBEK_NAMES[code] : names?.of(code)) ?? code;

    const named = COUNTRIES.map((country) => ({
        ...country,
        name: nameOf(country.code),
    }));
    const rest = named
        .slice(LEADING)
        .sort((first, second) => first.name.localeCompare(second.name, locale));

    return [
        ...named.slice(0, LEADING),
        ...rest,
        { code: OTHER_COUNTRY, dial: '', name: otherLabel },
    ];
}
