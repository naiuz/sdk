/**
 * What a widget keeps in the visitor's browser, by the widget it's for. A page can forbid storage, or a browser can
 * throw when asked: then it lasts as long as the page does, and the visitor starts over next time.
 */
export interface WidgetStorage {
    visitorToken(): string | null;
    setVisitorToken(token: string): void;
    session(): {token: string; url: string} | null;
    setSession(session: {token: string; url: string}): void;
    forgetSession(): void;
    termsAccepted(): boolean;
    acceptTerms(): void;
    lastOpenedAt(): number | null;
    setLastOpenedAt(at: number): void;
    language(): string | null;
    setLanguage(language: string): void;
    /** A link the visitor followed with the panel open, for the page it brings them to. */
    takeResumeOpen(): boolean;
    setResumeOpen(): void;
}

type Area = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryArea(): Area {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
        removeItem: (key) => {
            values.delete(key);
        },
    };
}

/** An area that never throws: what it can't keep, it keeps in memory. */
function safely(open: () => Area | undefined): Area {
    const memory = memoryArea();
    const attempt = <Result>(run: (area: Area) => Result, otherwise: (area: Area) => Result): Result => {
        try {
            const area = open();
            return area === undefined ? otherwise(memory) : run(area);
        } catch {
            return otherwise(memory);
        }
    };
    return {
        getItem: (key) => memory.getItem(key) ?? attempt((area) => area.getItem(key), () => null),
        setItem: (key, value) => {
            memory.setItem(key, value);
            attempt((area) => {
                area.setItem(key, value);
            }, () => undefined);
        },
        removeItem: (key) => {
            memory.removeItem(key);
            attempt((area) => {
                area.removeItem(key);
            }, () => undefined);
        },
    };
}

export function createStorage(
    id: string,
    areas: {local?: () => Area | undefined; session?: () => Area | undefined} = {},
): WidgetStorage {
    const local = safely(areas.local ?? (() => globalThis.localStorage));
    const tab = safely(areas.session ?? (() => globalThis.sessionStorage));
    const key = (name: string) => `neuronai-widget:${id}:${name}`;

    return {
        visitorToken: () => local.getItem(key("visitor")),
        setVisitorToken: (token) => {
            local.setItem(key("visitor"), token);
        },
        session() {
            const kept = local.getItem(key("session"));
            if (kept === null) return null;
            try {
                const session = JSON.parse(kept) as {token?: unknown; url?: unknown};
                return typeof session.token === "string" && typeof session.url === "string" ? {token: session.token, url: session.url} : null;
            } catch {
                return null;
            }
        },
        setSession: (session) => {
            local.setItem(key("session"), JSON.stringify(session));
        },
        forgetSession: () => {
            local.removeItem(key("session"));
        },
        termsAccepted: () => local.getItem(key("terms")) === "1",
        acceptTerms: () => {
            local.setItem(key("terms"), "1");
        },
        lastOpenedAt() {
            const at = Number(local.getItem(key("opened-at")));
            return Number.isFinite(at) && at > 0 ? at : null;
        },
        setLastOpenedAt: (at) => {
            local.setItem(key("opened-at"), String(at));
        },
        language: () => local.getItem(key("language")),
        setLanguage: (language) => {
            local.setItem(key("language"), language);
        },
        takeResumeOpen() {
            const open = tab.getItem(key("resume-open")) === "1";
            tab.removeItem(key("resume-open"));
            return open;
        },
        setResumeOpen: () => {
            tab.setItem(key("resume-open"), "1");
        },
    };
}
