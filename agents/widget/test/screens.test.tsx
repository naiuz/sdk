import {MicrophoneError, SessionError} from "@naiuz/agents";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {App} from "../src/App";
import type {WidgetSettings} from "../src/settings";
import {sessions} from "./fake-conversation";
import {fire, mount, settled} from "./harness";

vi.mock("@naiuz/agents-vue", () => import("./fake-conversation"));

const KEY = "01hzzzzzzzzzzzzzzzzzzzzzzz";

function widget(change: Partial<WidgetSettings> = {}): WidgetSettings {
    return {
        available: true,
        mode: "voice_and_text",
        locale: "en",
        languages: ["en"],
        branding: {primary_color: "#0EA5E9", text_color: "#FFFFFF", bubble_icon: "default", position: "bottom-right"},
        texts: {title: "Shop", subtitle: "Ask us", welcome: "Hi, I'm Madina", launcher_label: null, consent_text: null, terms_text: null, suggested_questions: []},
        contact: {mode: "agent_asks", fields: {name: {enabled: true, required: true}, phone: {enabled: false, required: false}, email: {enabled: false, required: false}}, consent: null},
        features: {voice: true, attachments: true, sound: false, feedback: false, in_page_links: false},
        terms: null,
        unread: 0,
        has_conversation: false,
        last_message: null,
        ...change,
    };
}

/** The server: what it answers, and what it was asked. */
function serve(settings: WidgetSettings | null, answers: Record<string, () => Response> = {}) {
    const asked: {url: string; init: RequestInit}[] = [];
    const json = (data: unknown, status = 200) => new Response(JSON.stringify({data}), {status});
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
        asked.push({url, init});
        const path = url.replace("https://x.uz/api/agents/v1", "").replace(`/widgets/${KEY}`, "/widget").split("?")[0] ?? "";
        const answer = answers[path];
        if (answer !== undefined) return Promise.resolve(answer());
        if (path === "/widget" || path === "/agents/agent_1/widget") return Promise.resolve(json(settings ?? {available: false}));
        if (path === "/sessions") return Promise.resolve(json({token: "session-1", url: "wss://x.uz/ws", voice: true, visitor_token: "visitor-1"}));
        if (path === "/widget/messages") return Promise.resolve(json({messages: [], has_more: false, status: null, conversation_id: null}));
        if (path === "/widget/seen" || path === "/widget/events") return Promise.resolve(new Response(null, {status: 204}));
        if (path === "/widget/unread") return Promise.resolve(json({unread: 0}));
        return Promise.resolve(new Response("{}", {status: 404}));
    });
    return asked;
}

const asksOf = (asked: {url: string; init: RequestInit}[], ending: string) => asked.filter(({url}) => url.split("?")[0]?.endsWith(ending));

async function show(settings: WidgetSettings | null, props: Record<string, unknown> = {}, answers: Record<string, () => Response> = {}) {
    const asked = serve(settings, answers);
    const page = mount(App, {widgetKey: KEY, apiUrl: "https://x.uz", lang: "en", ...props});
    await settled();
    return {page, asked};
}

const pageEvents = new Map<string, () => void>();

beforeEach(() => {
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"]});
    sessions.length = 0;
    pageEvents.clear();
    vi.stubGlobal("document", {
        documentElement: {lang: "", style: {}},
        visibilityState: "visible",
        addEventListener: (type: string, listener: () => void) => pageEvents.set(type, listener),
        removeEventListener: (type: string) => pageEvents.delete(type),
    });
    vi.stubGlobal("window", {matchMedia: () => ({matches: false, addEventListener: () => undefined, removeEventListener: () => undefined}), addEventListener: () => undefined, removeEventListener: () => undefined, location: {origin: "https://shop.uz", hostname: "shop.uz"}, parent: {postMessage: vi.fn()}});
    vi.stubGlobal("navigator", {languages: ["en"]});
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("localStorage", (() => {
        const values = new Map<string, string>();
        return {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key)};
    })());
});

afterEach(() => {
    vi.useRealTimers();
});

function must<Value>(value: Value | undefined): Value {
    if (value === undefined) throw new Error("It isn't there.");
    return value;
}

const conversationFailed = (page: {text: () => string}) => page.text().includes("The call couldn't start");
const chat = () => must(sessions[0]);
const call = () => must(sessions[1]);

describe("the channel page's preview", () => {
    test("Welcome on a text-only widget shows the welcome and its questions, and Chat a sample", async () => {
        const parent = {postMessage: () => undefined};
        let receive: (event: MessageEvent) => void = () => undefined;
        vi.stubGlobal("window", {
            location: {origin: "https://x.uz"},
            parent,
            matchMedia: () => ({matches: false, addEventListener: () => undefined, removeEventListener: () => undefined}),
            addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
                if (type === "message") receive = listener;
            },
            removeEventListener: () => undefined,
        });
        const say = async (type: string, payload: unknown) => {
            receive({origin: "https://x.uz", source: parent, data: {type: `neuron-widget:preview:${type}`, payload}} as never);
            await settled();
        };
        const page = mount(App, {preview: true, lang: "en"});
        await settled();
        const text = widget({mode: "text"});
        await say("settings", {...text, texts: {...text.texts, suggested_questions: ["Narxi qancha?"]}});

        await say("state", "welcome");
        expect(page.text()).toContain("Hi, I'm Madina");
        expect(page.hasButton("Narxi qancha?")).toBe(true);
        expect(page.byClass("bubble-mine")).toHaveLength(0);

        await say("state", "chat");
        expect(page.text()).not.toContain("Hi, I'm Madina");
        expect(page.byClass("bubble-mine")).toHaveLength(1);
        expect(chat().started).toEqual([]);
    });
});

describe("what a page shows", () => {
    test("a launcher, and nothing connects until someone opens it", async () => {
        const {page} = await show(widget());
        expect(page.hasClass("launcher")).toBe(true);
        expect(page.hasClass("panel")).toBe(false);
        expect(chat().started).toEqual([]);
    });

    test("nothing, where nothing could answer", async () => {
        const {page} = await show(null);
        expect(page.text()).toBe("");
        expect(page.hasClass("launcher")).toBe(false);
    });

    test("nothing, on a site that isn't allowed", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const {page} = await show(widget(), {}, {"/widget": () => new Response(JSON.stringify({error: {code: "origin_not_allowed", message: "Not here"}}), {status: 403})});
        expect(page.hasClass("launcher")).toBe(false);
        expect(warn).toHaveBeenCalledWith("[neuronai-agent] Not here");
    });

    test("the launcher's count, read out too", async () => {
        const {page} = await show(widget({unread: 12}));
        expect(page.byClass("launcher-badge")[0]?.children[0]?.text).toBe("9+");
        expect(page.button("Open chat with Shop 12 new replies")).toBeDefined();
    });

    test("opening clears the count, and says it's been seen", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        const {page, asked} = await show(widget({unread: 3}));
        await page.press("Open chat with Shop 3 new replies");
        await vi.advanceTimersByTimeAsync(1100);
        expect(page.hasClass("launcher-badge")).toBe(false);
        expect(asksOf(asked, "/seen")).toHaveLength(1);
        expect((asksOf(asked, "/seen")[0]?.init.headers as Record<string, string>)["X-Visitor-Token"]).toBe("visitor-1");
    });
});

describe("each mode", () => {
    test("voice and text opens home, with both ways to talk and what others ask", async () => {
        const {page} = await show(widget({texts: {...widget().texts, suggested_questions: ["Where is my order?"]}, last_message: {excerpt: "Last words", at: null}}));
        await page.press("Open chat");
        expect(page.hasClass("home")).toBe(true);
        expect(page.text()).toContain("Hi, I'm Madina");
        for (const words of ["Call", "Message", "Where is my order?", "Last words"]) expect(page.hasButton(words)).toBe(true);
        expect(chat().started).toEqual([]);
    });

    test("text only opens the chat, and connects", async () => {
        const {page} = await show(widget({mode: "text"}));
        await page.press("Open chat");
        expect(page.hasClass("chat")).toBe(true);
        expect(page.hasButton("Call")).toBe(false);
        expect(chat().started[0]).toMatchObject({token: "session-1", serverUrl: "wss://x.uz/ws", textOnly: true, overrides: {language: "en"}});
    });

    test("voice only opens the call, which waits to be started, with no way to type", async () => {
        const {page} = await show(widget({mode: "voice"}));
        await page.press("Open chat");
        expect(page.hasClass("call")).toBe(true);
        expect(chat().started).toEqual([]);
        await page.press("Start call");
        // The call opens the conversation, so the agent greets by voice, and the text session follows on its token.
        expect(call().started[0]).toMatchObject({token: "session-1", textOnly: false});
        expect(chat().started[0]).toMatchObject({token: "resume-1", textOnly: true});
        expect(page.hasButton("Type")).toBe(false);
        expect(page.hasButton("End")).toBe(true);
    });

    test("a call from a chat already going on is a second connection on it", async () => {
        const {page} = await show(widget());
        await page.press("Open chat");
        await page.press("Message");
        expect(chat().started[0]).toMatchObject({token: "session-1"});
        await page.press("Call");
        expect(call().started[0]).toMatchObject({token: "resume-1", textOnly: false});
    });

    test("the agent's words in a call reach the caption", async () => {
        const {page} = await show(widget({mode: "voice"}));
        await page.press("Open chat");
        await page.press("Start call");
        (call().callbacks as Record<string, (value: unknown) => void>).onMessage?.({source: "ai", message: "Assalomu alaykum", eventId: 1});
        await settled();
        expect(page.hasClass("caption")).toBe(true);
        expect(page.text()).toContain("Assalomu alaykum");
    });

    test("a contact form before a call sends what it asked with the call's session", async () => {
        const {page, asked} = await show(widget({mode: "voice", contact: {...widget().contact, mode: "before_chat"}}));
        await page.press("Open chat");
        await page.press("Start call");
        fire(must(page.all().find((node) => node.props.autocomplete === "name")), "onInput", {target: {value: "Aziz"}});
        await settled();
        fire(must(page.all().find((node) => node.tag === "form")), "onSubmit", {preventDefault: () => undefined});
        await settled();
        expect(JSON.parse(asksOf(asked, "/sessions")[0]?.init.body as string)).toMatchObject({mode: "voice", contact: {name: "Aziz"}});
        expect(page.hasClass("call")).toBe(true);
        expect(call().started).toHaveLength(1);
    });

    test("a suggested question starts a text conversation with it", async () => {
        const {page} = await show(widget({texts: {...widget().texts, suggested_questions: ["Where is my order?"]}}));
        await page.press("Open chat");
        await page.press("Where is my order?");
        expect(page.hasClass("chat")).toBe(true);
        expect(chat().sent[0]?.text).toBe("Where is my order?");
    });
});

describe("before the first message", () => {
    test("terms come first, and aren't asked again", async () => {
        const {page} = await show(widget({mode: "text", terms: {text: "Our terms", url: "https://shop.uz/terms"}}));
        await page.press("Open chat");
        expect(page.text()).toContain("Our terms");
        expect(chat().started).toEqual([]);
        await page.press("Accept");
        expect(page.hasClass("chat")).toBe(true);
        expect(localStorage.getItem(`neuronai-widget:${KEY}:terms`)).toBe("1");
    });

    test("a link in the terms that would run something isn't one", async () => {
        const {page} = await show(widget({mode: "text", terms: {text: "x", url: "javascript:alert(1)"}}));
        await page.press("Open chat");
        expect(page.all().filter((node) => node.tag === "a")).toEqual([]);
    });

    test("the contact form sends what it asks for, and shows what the server says", async () => {
        const refused = new Response(JSON.stringify({error: {code: "invalid_request", message: "No", fields: {"contact.name": "That name won't do"}}}), {status: 422});
        const {page, asked} = await show(widget({mode: "text", contact: {...widget().contact, mode: "before_chat"}}), {}, {"/sessions": () => refused});
        await page.press("Open chat");
        const form = () => must(page.all().find((node) => node.tag === "form"));
        fire(form(), "onSubmit", {preventDefault: () => undefined});
        await settled();
        expect(page.text()).toContain("Enter your name.");
        expect(asksOf(asked, "/sessions")).toEqual([]);

        fire(must(page.all().find((node) => node.props.autocomplete === "name")), "onInput", {target: {value: "Aziz"}});
        await settled();
        fire(form(), "onSubmit", {preventDefault: () => undefined});
        await settled();
        expect(JSON.parse(asksOf(asked, "/sessions")[0]?.init.body as string)).toMatchObject({contact: {name: "Aziz"}});
        expect(page.text()).toContain("That name won't do");
        expect(page.hasClass("chat")).toBe(false);
    });

    test("someone it knows isn't asked again", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        const {page, asked} = await show(widget({mode: "text", contact: {...widget().contact, mode: "before_chat"}}));
        await page.press("Open chat");
        expect(page.hasClass("chat")).toBe(true);
        expect(JSON.parse(asksOf(asked, "/sessions")[0]?.init.body as string)).toMatchObject({visitor_token: "visitor-1", contact: {}});
    });
});

describe("the conversation", () => {
    async function inChat(change: Partial<WidgetSettings> = {}) {
        const shown = await show(widget({mode: "text", ...change}));
        await shown.page.press("Open chat");
        return shown;
    }

    const type = async (page: Awaited<ReturnType<typeof inChat>>["page"], text: string) => {
        fire(must(page.all().find((node) => node.tag === "textarea")), "onInput", {target: {value: text, style: {}, scrollHeight: 20}});
        await settled();
        fire(must(page.all().find((node) => node.tag === "form")), "onSubmit", {preventDefault: () => undefined});
        await settled();
    };

    test("a new visitor's token is kept for next time", async () => {
        await inChat();
        expect(localStorage.getItem(`neuronai-widget:${KEY}:visitor`)).toBe("visitor-1");
    });

    test("what's written shows at once, and a failure offers Retry with the same id", async () => {
        const {page} = await inChat();
        chat().sendWith = () => Promise.reject(new Error("down"));
        await type(page, "Salom");
        expect(page.text()).toContain("Salom");
        expect(page.text()).toContain("Not sent");
        const id = chat().sent[0]?.options.clientMessageId;
        chat().sendWith = null;
        await page.press("Retry");
        expect(chat().sent[1]?.options.clientMessageId).toBe(id);
        expect(page.text()).not.toContain("Not sent");
    });

    test("an operator joining shows who, and their reply and typing say whose", async () => {
        const {page} = await inChat();
        const callbacks = chat().callbacks as Record<string, (value: unknown) => void>;
        const operator = {name: "Dilshod", avatar_url: null};
        callbacks.onHandoff?.({reason: "agent"});
        await settled();
        expect(page.text()).toContain("An operator will reply here soon.");
        callbacks.onOperatorTyping?.({operator});
        await settled();
        expect(page.text()).toContain("Dilshod is typing…");
        callbacks.onMessage?.({source: "operator", message: "Salom", eventId: 3, operator, messageId: 9});
        await settled();
        expect(page.text()).toContain("Dilshod joined the conversation");
        expect(page.text()).not.toContain("is typing");
    });

    test("thumbs show only when the widget has them, and take back on a second press", async () => {
        const without = await inChat();
        (chat().callbacks as Record<string, (value: unknown) => void>).onMessage?.({source: "ai", message: "Salom", eventId: 2});
        await settled();
        expect(without.page.hasClass("thumb")).toBe(false);
        without.page.unmount();

        sessions.length = 0;
        const {page} = await inChat({features: {...widget().features, feedback: true}});
        (chat().callbacks as Record<string, (value: unknown) => void>).onMessage?.({source: "ai", message: "Salom", eventId: 2});
        await settled();
        await page.press("Good reply");
        await page.press("Good reply");
        expect(chat().feedback).toEqual([[2, "like"], [2, null]]);
    });

    test("thumbs stay off replies of an earlier conversation, and off everything once the session is over", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        const line = {client_message_id: null, event_id: 2, feedback: null, operator: null, sender_type: "ai", reply_to: null, attachments: [], created_at: null};
        const log = {messages: [{...line, id: 1, conversation_id: "conv_0", content: "Oldin"}, {...line, id: 2, conversation_id: "conv_1", event_id: 3, content: "Hozir"}], has_more: false, status: null, conversation_id: "conv_1"};
        const {page} = await show(widget({mode: "text", features: {...widget().features, feedback: true}}), {}, {"/widget/messages": () => new Response(JSON.stringify({data: log}))});
        await page.press("Open chat");
        expect(page.byClass("message-thumbs")).toHaveLength(1);
        chat().status.value = "disconnected";
        await settled();
        expect(page.byClass("message-thumbs")).toHaveLength(0);
    });

    test("a reply nobody could see counts and chimes, and one they can is seen", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        const {page, asked} = await inChat();
        const message = {source: "ai", message: "Salom", eventId: 2};
        (chat().callbacks as Record<string, (value: unknown) => void>).onMessage?.(message);
        await vi.advanceTimersByTimeAsync(1100);
        const seen = asksOf(asked, "/seen").length;
        expect(seen).toBeGreaterThan(0);
        await page.press("Close chat");
        (chat().callbacks as Record<string, (value: unknown) => void>).onMessage?.({...message, eventId: 3});
        await settled();
        expect(page.byClass("launcher-badge")[0]?.children[0]?.text).toBe("1");
    });

    test("connecting that fails says so, and Try again does", async () => {
        const shown = await show(widget({mode: "text"}));
        chat().startWith = () => Promise.reject(new SessionError(1011, "down"));
        await shown.page.press("Open chat");
        expect(shown.page.text()).toContain("We couldn't connect. Try again.");
        chat().startWith = null;
        await shown.page.press("Try again");
        expect(shown.page.text()).not.toContain("We couldn't connect");
    });

    test("a kept token past its life finds the same visitor a new session", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        localStorage.setItem(`neuronai-widget:${KEY}:session`, JSON.stringify({token: "old", url: "wss://x.uz/ws"}));
        const {page, asked} = await show(widget({mode: "text"}));
        chat().startWith = () => {
            chat().startWith = null;
            return Promise.reject(new SessionError(4001, "expired"));
        };
        await page.press("Open chat");
        expect(chat().started.map((options) => options.token)).toEqual(["old", "session-1"]);
        expect(JSON.parse(asksOf(asked, "/sessions")[0]?.init.body as string)).toMatchObject({visitor_token: "visitor-1"});
    });

    test("a kept token that's good goes on, with no new session", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:session`, JSON.stringify({token: "kept", url: "wss://x.uz/ws"}));
        const {page, asked} = await show(widget({mode: "text"}));
        await page.press("Open chat");
        expect(chat().started[0]).toMatchObject({token: "kept"});
        expect(asksOf(asked, "/sessions")).toEqual([]);
    });

    test("a reply can be quoted a moment after it arrives, once the log has its id", async () => {
        const stored = {id: 7, conversation_id: "conv_1", client_message_id: null, event_id: 4, feedback: null, operator: null, sender_type: "ai", content: "Javob", caption: null, display_text: null, reply_to: null, attachments: [], created_at: "2026-11-05T10:00:00Z"};
        let log: unknown[] = [];
        const {page, asked} = await show(widget({mode: "text"}), {}, {"/widget/messages": () => new Response(JSON.stringify({data: {messages: log, has_more: false, status: null, conversation_id: "conv_1"}}), {status: 200})});
        await page.press("Open chat with Shop");
        await settled();
        chat().callbacks.onMessage?.({source: "ai", message: "Javob", eventId: 4} as never);
        await settled();
        expect(page.hasButton("Reply")).toBe(false);

        // Its record reaches the log just after the reply ends.
        log = [stored];
        const before = asksOf(asked, "/messages").length;
        await vi.advanceTimersByTimeAsync(1500);
        await settled();

        expect(asksOf(asked, "/messages").length).toBe(before + 1);
        expect(page.hasButton("Reply")).toBe(true);
    });

    test("a file alone has no empty bubble over it", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        const file = {id: 1, file_name: "prices.txt", file_type: "text/plain", file_size: 19, preview_kind: null, preview_url: "https://x.uz/f?signature=s", download_url: "https://x.uz/f?signature=s"};
        const line = {conversation_id: "conv_1", client_message_id: null, event_id: null, feedback: null, content: null, caption: null, display_text: null, reply_to: null, attachments: [file], created_at: null};
        const log = {messages: [{...line, id: 1, sender_type: "operator", operator: {name: "Dilshod", avatar_url: null}}, {...line, id: 2, sender_type: "ai", operator: null}], has_more: false, status: null, conversation_id: "conv_1"};
        const {page} = await show(widget({mode: "text"}), {}, {"/widget/messages": () => new Response(JSON.stringify({data: log}), {status: 200})});
        await page.press("Open chat");
        await settled();
        expect(page.byClass("message-file")).toHaveLength(2);
        expect(page.byClass("bubble")).toHaveLength(0);
    });

    test("earlier messages show first, from the log", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        const log = {messages: [{id: 1, conversation_id: "conv_1", client_message_id: null, event_id: null, feedback: null, operator: null, sender_type: "ai", content: "Oldingi javob", reply_to: null, attachments: [], created_at: null}], has_more: true, status: null, conversation_id: null};
        const {page} = await show(widget({mode: "text"}), {}, {"/widget/messages": () => new Response(JSON.stringify({data: log}))});
        await page.press("Open chat");
        expect(page.text()).toContain("Oldingi javob");
        expect(page.hasButton("Earlier messages")).toBe(true);
    });
});

describe("a call that can't be", () => {
    async function calling(mode: WidgetSettings["mode"], error: Error) {
        const {page} = await show(widget({mode}));
        await page.press("Open chat");
        call().startWith = () => Promise.reject(error);
        await page.press(mode === "voice" ? "Start call" : "Call");
        return page;
    }

    test("the microphone refused goes on as text, and says so", async () => {
        const page = await calling("voice_and_text", new MicrophoneError("denied"));
        expect(page.hasClass("chat")).toBe(true);
        expect(chat().started).toHaveLength(1);
        expect(page.text()).toContain("Allow microphone access to talk. You can also send a message.");
    });

    test("busy lines go on as text, and say so", async () => {
        const page = await calling("voice_and_text", new SessionError(4009, "busy"));
        expect(page.hasClass("chat")).toBe(true);
        expect(page.text()).toContain("All lines are busy. Send a message instead.");
    });

    test("a voice-only widget stays on the call, and says what's wrong", async () => {
        const page = await calling("voice", new MicrophoneError("denied"));
        expect(page.hasClass("call")).toBe(true);
        expect(page.text()).toContain("Allow microphone access to talk.");
    });

    test("a handoff in a call opens the chat with the card once the call has ended", async () => {
        const {page} = await show(widget());
        await page.press("Open chat");
        await page.press("By voice");
        (chat().callbacks as Record<string, (value: unknown) => void>).onHandoff?.({reason: "agent"});
        await settled();
        expect(page.hasClass("call")).toBe(true);
        await vi.advanceTimersByTimeAsync(8100);
        (call().callbacks as Record<string, () => void>).onDisconnect?.();
        await settled();
        expect(page.hasClass("chat")).toBe(true);
        expect(page.text()).toContain("An operator will reply here soon.");
    });
});

describe("what the review found", () => {
    const typed = async (page: Awaited<ReturnType<typeof show>>["page"], text: string) => {
        fire(must(page.all().find((node) => node.tag === "textarea")), "onInput", {target: {value: text, style: {}, scrollHeight: 20}});
        await settled();
        fire(must(page.all().find((node) => node.tag === "form")), "onSubmit", {preventDefault: () => undefined});
        await settled();
    };
    const fillContact = async (page: Awaited<ReturnType<typeof show>>["page"]) => {
        fire(must(page.all().find((node) => node.props.autocomplete === "name")), "onInput", {target: {value: "Aziz"}});
        await settled();
        fire(must(page.all().find((node) => node.tag === "form")), "onSubmit", {preventDefault: () => undefined});
        await settled();
    };
    const sessionBodies = (asked: {url: string; init: RequestInit}[]) => asksOf(asked, "/sessions").map(({init}) => JSON.parse(init.body as string) as Record<string, unknown>);
    const ok = () => new Response(JSON.stringify({data: {token: "session-1", url: "wss://x.uz/ws", voice: true, visitor_token: "visitor-1"}}), {status: 200});
    const operatorLine = {id: 9, conversation_id: "conv_1", client_message_id: null, event_id: 3, feedback: null, operator: {name: "Dilshod", avatar_url: null}, sender_type: "operator", content: "Javobim tayyor", caption: null, display_text: null, reply_to: null, attachments: [], created_at: null};

    test("a reply waiting opens where it can be read, on any mode", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        for (const mode of ["voice", "voice_and_text"] as const) {
            const {page} = await show(widget({mode, unread: 1}), {}, {"/widget/messages": () => new Response(JSON.stringify({data: {messages: [operatorLine], has_more: false, status: null, conversation_id: "conv_1"}}), {status: 200})});
            await page.press("Open chat");
            await settled();
            expect(page.hasClass("chat")).toBe(true);
            expect(page.text()).toContain("Javobim tayyor");
            page.unmount();
        }
    });

    test("an operator's reply reaches a panel on a quiet call screen", async () => {
        const {page} = await show(widget({mode: "voice"}));
        await page.press("Open chat");
        await page.press("Start call");
        call().status.value = "disconnected";
        (call().callbacks as Record<string, () => void>).onDisconnect?.();
        await settled();
        expect(page.hasClass("call")).toBe(true);
        (chat().callbacks as Record<string, (value: unknown) => void>).onMessage?.({source: "operator", message: "Salom", eventId: 3, operator: {name: "Dilshod", avatar_url: null}, messageId: 9});
        await settled();
        expect(page.hasClass("chat")).toBe(true);
    });

    test("a call that failed offers the chat, where there is one", async () => {
        const {page} = await show(widget());
        await page.press("Open chat");
        call().startWith = () => Promise.reject(new SessionError(1011, "down"));
        await page.press("By voice");
        expect(page.hasClass("call")).toBe(true);
        expect(page.text()).toContain("The call couldn't start");
        await page.press("Type");
        expect(page.hasClass("chat")).toBe(true);
        expect(chat().started).toHaveLength(1);
    });

    test("a text session's token that can't call gives way to a session that can", async () => {
        const {page, asked} = await show(widget());
        await page.press("Open chat");
        await page.press("Message");
        let tries = 0;
        call().startWith = () => {
            tries += 1;
            return tries === 1 ? Promise.reject(new SessionError(4003, "not_allowed")) : Promise.resolve();
        };
        await page.press("Call");
        expect(call().started).toHaveLength(2);
        expect(call().started[1]).toMatchObject({token: "session-1", textOnly: false});
        expect(sessionBodies(asked).at(-1)).toMatchObject({mode: "voice"});
        expect(page.hasClass("call")).toBe(true);
        expect(conversationFailed(page)).toBe(false);
    });

    test("an agent's id with such a token goes on as text, and says so", async () => {
        const {page} = await show(widget(), {widgetKey: undefined, agentId: "agent_1"});
        await page.press("Open chat");
        await page.press("Message");
        call().startWith = () => Promise.reject(new SessionError(4003, "not_allowed"));
        await page.press("Call");
        expect(page.hasClass("chat")).toBe(true);
        expect(page.text()).toContain("Calls aren't available right now.");
    });

    test("the contact form doesn't undo a call's fall back to text", async () => {
        const {page} = await show(widget({contact: {...widget().contact, mode: "before_chat"}}));
        await page.press("Open chat");
        await page.press("By voice");
        call().startWith = () => Promise.reject(new MicrophoneError("denied"));
        await fillContact(page);
        expect(page.hasClass("chat")).toBe(true);
        expect(page.text()).toContain("Allow microphone access to talk.");
    });

    test("what the contact form said survives a call that couldn't be paid for", async () => {
        let tries = 0;
        const {page, asked} = await show(widget({contact: {...widget().contact, mode: "before_chat"}}), {}, {
            "/sessions": () => {
                tries += 1;
                return tries === 1 ? new Response(JSON.stringify({error: {code: "insufficient_balance", message: "No"}}), {status: 402}) : ok();
            },
        });
        await page.press("Open chat");
        await page.press("By voice");
        await fillContact(page);
        expect(page.hasClass("chat")).toBe(true);
        expect(sessionBodies(asked).at(-1)).toMatchObject({mode: "text", contact: {name: "Aziz"}});
    });

    test("what the contact form said survives a network failure, and Try again sends it", async () => {
        let tries = 0;
        const {page, asked} = await show(widget({mode: "text", contact: {...widget().contact, mode: "before_chat"}}), {}, {
            "/sessions": () => {
                tries += 1;
                return tries === 1 ? new Response("{}", {status: 503}) : ok();
            },
        });
        await page.press("Open chat");
        await fillContact(page);
        expect(page.text()).toContain("We couldn't connect");
        await page.press("Try again");
        expect(sessionBodies(asked).at(-1)).toMatchObject({contact: {name: "Aziz"}});
        expect(chat().started).toHaveLength(1);
    });

    test("a kept session the server won't take gives way to a new one, for the same visitor", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        localStorage.setItem(`neuronai-widget:${KEY}:session`, JSON.stringify({token: "old", url: "wss://x.uz/ws"}));
        const {page} = await show(widget({mode: "text"}));
        let tries = 0;
        chat().startWith = () => {
            tries += 1;
            return tries === 1 ? Promise.reject(new SessionError(1011, "internal_error")) : Promise.resolve();
        };
        await page.press("Open chat");
        expect(chat().started.map((one) => one.token)).toEqual(["old", "session-1"]);
        expect(page.text()).not.toContain("We couldn't connect");
    });

    test("a language the agent no longer has is dropped, not a dead end", async () => {
        const {page} = await show(widget({mode: "text"}));
        let tries = 0;
        chat().startWith = () => {
            tries += 1;
            return tries === 1 ? Promise.reject(new SessionError(4003, "not_allowed")) : Promise.resolve();
        };
        await page.press("Open chat");
        expect(chat().started[0]).toMatchObject({overrides: {language: "en"}});
        expect(chat().started[1]?.overrides).toBeUndefined();
        expect(page.text()).not.toContain("We couldn't connect");
    });

    test("when the agent asks, the consent line sits over the first message, and writing keeps it", async () => {
        const contact = {...widget().contact, mode: "agent_asks" as const, consent: {text: "Maʼlumotlarimni qayta ishlashga roziman", privacy_policy_url: "https://x.uz/p"}};
        const {page, asked} = await show(widget({mode: "text", contact}));
        await page.press("Open chat");
        expect(page.text()).toContain("Maʼlumotlarimni qayta ishlashga roziman");
        expect(sessionBodies(asked).every((body) => (body.contact as Record<string, unknown>).consent === undefined)).toBe(true);
        await typed(page, "Salom");
        expect(sessionBodies(asked).at(-1)).toMatchObject({visitor_token: "visitor-1", contact: {consent: true}});
        expect(page.text()).not.toContain("Maʼlumotlarimni qayta ishlashga roziman");
    });

    test("a plain http page, with no crypto.randomUUID, still sends", async () => {
        vi.stubGlobal("crypto", {getRandomValues: (bytes: Uint8Array) => bytes.fill(7)});
        const {page} = await show(widget({mode: "text"}));
        await page.press("Open chat");
        await typed(page, "Salom");
        expect(chat().sent).toHaveLength(1);
        expect(chat().sent[0]?.options.clientMessageId).toMatch(/^[0-9a-f]{32}$/);
    });

    test("a language that can't load leaves the widget where it is, and any call on it", async () => {
        let reads = 0;
        const {page} = await show(widget({languages: ["en", "ru"]}), {}, {
            "/widget": () => {
                reads += 1;
                return reads === 1 ? new Response(JSON.stringify({data: widget({languages: ["en", "ru"]})}), {status: 200}) : new Response("{}", {status: 503});
            },
        });
        await page.press("Open chat");
        await page.press("By voice");
        await page.press("Type");
        fire(must(page.all().find((node) => node.tag === "select")), "onChange", {target: {value: "ru"}});
        await settled();
        expect(page.hasClass("panel")).toBe(true);
        expect(page.hasClass("back-to-call")).toBe(true);
    });

    test("closing the panel on a call says the call goes on, and it can end from there", async () => {
        const {page} = await show(widget());
        await page.press("Open chat");
        await page.press("By voice");
        await page.press("Type");
        expect(page.hasButton("Close chat")).toBe(false);
        await page.press("Minimize");
        expect(page.hasClass("launcher-call")).toBe(true);
        expect(page.text()).toContain("On a call");
        await page.press("End");
        expect(call().ended).toBe(1);
    });

    test("a call on its way can be stopped, and opens nothing after", async () => {
        let answer: (response: Response) => void = () => undefined;
        const pending = new Promise<Response>((resolve) => {
            answer = resolve;
        });
        const {page} = await show(widget(), {}, {"/sessions": () => pending as unknown as Response});
        await page.press("Open chat");
        await page.press("By voice");
        await page.press("End");
        answer(ok());
        await settled();
        expect(call().started).toEqual([]);
    });

    test("a call on its way when the element goes opens nothing", async () => {
        let answer: (response: Response) => void = () => undefined;
        const pending = new Promise<Response>((resolve) => {
            answer = resolve;
        });
        const {page} = await show(widget(), {}, {"/sessions": () => pending as unknown as Response});
        await page.press("Open chat");
        await page.press("By voice");
        page.unmount();
        answer(ok());
        await settled();
        expect(call().started).toEqual([]);
    });

    test("a reply read on coming back to the tab is seen, with no count left", async () => {
        localStorage.setItem(`neuronai-widget:${KEY}:visitor`, "visitor-1");
        const {page, asked} = await show(widget({mode: "text"}));
        await page.press("Open chat");
        await vi.advanceTimersByTimeAsync(1100);
        const before = asksOf(asked, "/seen").length;
        (document as unknown as {visibilityState: string}).visibilityState = "hidden";
        (chat().callbacks as Record<string, (value: unknown) => void>).onMessage?.({source: "ai", message: "Salom", eventId: 2});
        await vi.advanceTimersByTimeAsync(1100);
        expect(asksOf(asked, "/seen")).toHaveLength(before);

        (document as unknown as {visibilityState: string}).visibilityState = "visible";
        pageEvents.get("visibilitychange")?.();
        await vi.advanceTimersByTimeAsync(1100);
        expect(asksOf(asked, "/seen").length).toBeGreaterThan(before);
        await page.press("Close chat");
        expect(page.hasClass("launcher-badge")).toBe(false);
    });

    test("the widget's own test page counts no opens", async () => {
        const {page, asked} = await show(widget({mode: "text"}), {test: true});
        await page.press("Open chat");
        expect(asksOf(asked, "/events")).toEqual([]);
    });

    test("a voice-only widget doesn't tell anyone to send a message", async () => {
        const {page} = await show(widget({mode: "voice"}));
        await page.press("Open chat");
        call().startWith = () => Promise.reject(new SessionError(4010, "balance"));
        await page.press("Start call");
        expect(page.text()).toContain("Calls aren't available right now.");
        expect(page.text()).not.toContain("Send a message");
    });

    test("what's typed in the panel stays out of the page's hotkeys", async () => {
        const {page} = await show(widget({mode: "text"}));
        await page.press("Open chat");
        const panel = page.byClass("panel")[0] as NonNullable<ReturnType<typeof page.byClass>[0]>;
        for (const name of ["onKeydown", "onKeyup", "onKeypress"]) {
            const stopped = vi.fn();
            fire(panel, name, {key: "k", stopPropagation: stopped});
            expect(stopped).toHaveBeenCalled();
        }
    });
});

describe("the language", () => {
    test("there's a chip when the agent has more than one", async () => {
        const single = await show(widget({mode: "text"}));
        await single.page.press("Open chat");
        expect(single.page.hasClass("language-chip")).toBe(false);
        single.page.unmount();
        sessions.length = 0;
        const {page} = await show(widget({mode: "text", languages: ["uz", "en"]}));
        await page.press("Open chat");
        expect(page.hasClass("language-chip")).toBe(true);
    });

    test("choosing another goes on in it, and it's kept", async () => {
        const {page, asked} = await show(widget({mode: "text", languages: ["uz", "en"]}));
        await page.press("Open chat");
        const select = must(page.all().find((node) => node.tag === "select"));
        fire(select, "onChange", {target: {value: "uz"}});
        await settled();
        expect(asked.some(({url}) => url.includes("lang=uz"))).toBe(true);
        expect(chat().ended).toBe(1);
        expect(chat().started.at(-1)).toMatchObject({token: "resume-1", overrides: {language: "uz"}});
        expect(localStorage.getItem(`neuronai-widget:${KEY}:language`)).toBe("uz");
    });

    test("a language the agent doesn't speak asks for nothing it would refuse", async () => {
        const {page} = await show(widget({mode: "text", languages: ["uz"]}));
        await page.press("Open chat");
        expect(chat().started[0]?.overrides).toBeUndefined();
    });
});

describe("an element with only an agent's id", () => {
    test("asks at the agent's address, and has no visitor, log or count", async () => {
        const {page, asked} = await show(widget({mode: "text"}), {widgetKey: undefined, agentId: "agent_1"});
        await page.press("Open chat");
        expect(JSON.parse(asksOf(asked, "/sessions")[0]?.init.body as string)).toEqual({agent_id: "agent_1", mode: "text"});
        expect(chat().started[0]?.overrides).toBeUndefined();
        expect(asksOf(asked, "/messages")).toEqual([]);
        expect(asksOf(asked, "/events")).toEqual([]);
    });

    test("uses the protocol's history for what it can't read from a log", async () => {
        const {page} = await show(widget({mode: "text"}), {widgetKey: undefined, agentId: "agent_1"});
        await page.press("Open chat");
        (chat().callbacks as Record<string, (value: unknown) => void>).onHistory?.([{role: "agent", text: "Oldingi", at: "t", message_id: 1, client_message_id: null}]);
        await settled();
        expect(page.text()).toContain("Oldingi");
    });
});
