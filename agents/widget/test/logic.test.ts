import {readFileSync} from "node:fs";
import {describe, expect, test} from "vitest";
import {brandColors, contrastRatio, lighterTint, orbColors} from "../src/brand";
import {callClock, captionSplit} from "../src/caption";
import {createI18n, resolveLocale} from "../src/i18n";
import {isSafeLink, isSameSite} from "../src/links";
import en from "../src/locales/en.json";
import ru from "../src/locales/ru.json";
import uz from "../src/locales/uz.json";
import {parseInline, parseMarkdown} from "../src/markdown";
import {createStorage} from "../src/storage";

function keysOf(value: unknown, prefix = ""): string[] {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => (typeof inner === "string" ? [`${prefix}${key}`] : keysOf(inner, `${prefix}${key}.`)));
}

describe("the words", () => {
    test("every language says everything", () => {
        expect(keysOf(ru).sort()).toEqual(keysOf(en).sort());
        expect(keysOf(uz).sort()).toEqual(keysOf(en).sort());
    });

    test("Uzbek uses its own apostrophes", () => {
        expect(JSON.stringify(uz)).not.toMatch(/[a-zA-Z]['’`][a-zA-Z]/);
    });

    test("the language a page asks for wins, then what the visitor chose, then the page's, then the browser's", () => {
        expect(resolveLocale("ru", "uz", "en", ["uz"])).toBe("ru");
        expect(resolveLocale(null, "uz", "en", ["ru"])).toBe("uz");
        expect(resolveLocale(null, null, "en-GB", ["ru"])).toBe("en");
        expect(resolveLocale(null, null, "fr", ["de", "ru-RU"])).toBe("ru");
        expect(resolveLocale(null, null, "fr", ["de"])).toBeNull();
    });

    test("it fills in what a sentence names, and says a key it doesn't know rather than nothing", () => {
        const {t} = createI18n("en");
        expect(t("launcher.open", {name: "Madina"})).toBe("Open chat with Madina");
        expect(t("no.such.key")).toBe("no.such.key");
    });

    test("it writes Uzbek dates itself, as browsers have no month names for it", () => {
        expect(createI18n("uz").formatTime("2026-09-28T11:36:00")).toBe("28-sen, 11:36");
        expect(createI18n("en").formatTime("nonsense")).toBe("");
    });
});

describe("the brand", () => {
    test("white stays on the brand down to 2.5:1, and slate below it", () => {
        expect(brandColors("#F08600").onBrand).toBe("#ffffff");
        expect(brandColors("#FDE047").onBrand).toBe("#0f172a");
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    });

    test("the customer's text colour wins, and nonsense leaves the default", () => {
        expect(brandColors("#123456", "#ABCDEF").onBrand).toBe("#ABCDEF");
        expect(brandColors("javascript:alert(1)").brand).toBe("#F08600");
    });

    test("the orb defaults to the brand and a lighter tint of it", () => {
        expect(lighterTint("#000000")).toBe("#8c8c8c");
        expect(orbColors("#102030")).toEqual(["#102030", lighterTint("#102030")]);
        expect(orbColors("#102030", "#AA0000", "#00AA00")).toEqual(["#AA0000", "#00AA00"]);
    });
});

describe("links", () => {
    test("only web addresses, mail and phone count as links", () => {
        expect(["https://a.uz", "/page", "mailto:a@b.uz", "tel:+998"].every(isSafeLink)).toBe(true);
        expect(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x"].some(isSafeLink)).toBe(false);
    });

    test("a page's own site is itself and its www. twin, and a sub-domain is another site", () => {
        expect(isSameSite("https://www.shop.uz/a", "shop.uz")).toBe(true);
        expect(isSameSite("/a", "shop.uz")).toBe(true);
        expect(isSameSite("https://blog.shop.uz", "shop.uz")).toBe(false);
        expect(isSameSite("https://evil.uz", "shop.uz")).toBe(false);
        expect(isSameSite("mailto:a@shop.uz", "shop.uz")).toBe(false);
    });
});

describe("markdown", () => {
    test("it reads bold, italics, code, links and bare addresses", () => {
        expect(parseInline("**a** *b* `c` [d](https://d.uz) https://e.uz.")).toEqual([
            {type: "strong", children: [{type: "text", text: "a"}]},
            {type: "text", text: " "},
            {type: "em", children: [{type: "text", text: "b"}]},
            {type: "text", text: " "},
            {type: "code", text: "c"},
            {type: "text", text: " "},
            {type: "link", href: "https://d.uz", children: [{type: "text", text: "d"}]},
            {type: "text", text: " "},
            {type: "link", href: "https://e.uz", children: [{type: "text", text: "https://e.uz"}]},
            {type: "text", text: "."},
        ]);
    });

    test("a link that would run something stays text", () => {
        expect(parseInline("[press](javascript:alert(1))").flatMap((node) => (node.type === "link" ? [node] : []))).toEqual([]);
    });

    test("HTML is only ever text", () => {
        expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([{type: "paragraph", children: [{type: "text", text: "<img src=x onerror=alert(1)>"}]}]);
    });

    test("it keeps paragraphs and lists apart", () => {
        const blocks = parseMarkdown("Salom\n\n- bir\n- ikki\n\n1. uch");
        expect(blocks.map((block) => block.type)).toEqual(["paragraph", "list", "list"]);
        expect(blocks[1]).toMatchObject({ordered: false, items: [[{text: "bir"}], [{text: "ikki"}]]});
        expect(blocks[2]).toMatchObject({ordered: true});
    });
});

describe("the caption", () => {
    test("it cuts what's been said back to a word's end, and is all of it when the time has passed", () => {
        expect(captionSplit("Salom dunyo", 400)).toEqual({spoken: "Salom", rest: " dunyo"});
        expect(captionSplit("Salom", Number.POSITIVE_INFINITY)).toEqual({spoken: "Salom", rest: ""});
    });

    test("the clock reads as a clock", () => {
        expect(callClock(65_000)).toBe("1:05");
        expect(callClock(3_661_000)).toBe("1:01:01");
    });
});

describe("what's kept in the browser", () => {
    function area() {
        const values = new Map<string, string>();
        return {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                values.set(key, value);
            },
            removeItem: (key: string) => {
                values.delete(key);
            },
        };
    }

    test("each widget keeps its own", () => {
        const local = area();
        const first = createStorage("a", {local: () => local, session: area});
        const second = createStorage("b", {local: () => local, session: area});
        first.setVisitorToken("visitor-a");
        expect(second.visitorToken()).toBeNull();
        expect(createStorage("a", {local: () => local, session: area}).visitorToken()).toBe("visitor-a");
    });

    test("a browser that refuses storage leaves it for the page's life, and throws nothing", () => {
        const refusing = () => {
            throw new Error("SecurityError");
        };
        const storage = createStorage("a", {local: refusing, session: refusing});
        storage.setVisitorToken("visitor");
        storage.acceptTerms();
        expect(storage.visitorToken()).toBe("visitor");
        expect(storage.termsAccepted()).toBe(true);
        expect(storage.session()).toBeNull();
    });

    test("a session kept in a form it can't read is no session", () => {
        const local = area();
        local.setItem("neuronai-widget:a:session", "{not json");
        expect(createStorage("a", {local: () => local, session: area}).session()).toBeNull();
    });

    test("a link's reopening is taken once", () => {
        const tab = area();
        const storage = createStorage("a", {local: area, session: () => tab});
        storage.setResumeOpen();
        expect(storage.takeResumeOpen()).toBe(true);
        expect(storage.takeResumeOpen()).toBe(false);
    });
});

test("the script stays under 80 KB gzipped", async () => {
    const {gzipSync} = await import("node:zlib");
    const built = new URL("../dist/widget.js", import.meta.url);
    expect(gzipSync(readFileSync(built)).length).toBeLessThan(80 * 1024);
});
