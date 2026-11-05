import {describe, expect, test, vi} from "vitest";
import {WidgetApi, WidgetApiError} from "../src/api";

const KEY = "01hzzzzzzzzzzzzzzzzzzzzzzz";

function answering(status: number, body: unknown) {
    return vi.fn<typeof fetch>(() => Promise.resolve(new Response(body === null ? null : JSON.stringify(body), {status})));
}

function call(fetcher: ReturnType<typeof answering>): [string, RequestInit] {
    return fetcher.mock.calls[0] as [string, RequestInit];
}

describe("a widget's settings", () => {
    test("come from its key, in the language asked for, with the visitor in a header", async () => {
        const fetcher = answering(200, {data: {available: true, mode: "text"}});
        await new WidgetApi("https://x.uz/", {widgetKey: KEY}, fetcher).settings("ru", "visitor-1");
        const [url, init] = call(fetcher);
        expect(url).toBe(`https://x.uz/api/agents/v1/widgets/${KEY}?lang=ru`);
        expect(url).not.toContain("visitor-1");
        expect((init.headers as Record<string, string>)["X-Visitor-Token"]).toBe("visitor-1");
    });

    test("an agent's id asks at the agent's address", async () => {
        const fetcher = answering(200, {data: {available: true}});
        await new WidgetApi("https://x.uz", {agentId: "agent_1"}, fetcher).settings(null, null);
        expect(call(fetcher)[0]).toBe("https://x.uz/api/agents/v1/agents/agent_1/widget");
    });

    test("are null where nothing could answer", async () => {
        expect(await new WidgetApi("https://x.uz", {widgetKey: KEY}, answering(200, {data: {available: false}})).settings(null, null)).toBeNull();
    });
});

describe("a session", () => {
    test("a widget's brings its visitor and what they said", async () => {
        const fetcher = answering(200, {data: {token: "t", url: "wss://x", voice: true, visitor_token: "v"}});
        await new WidgetApi("https://x.uz", {widgetKey: KEY}, fetcher).session({mode: "text", visitorToken: "v", contact: {name: "Aziz"}, test: false});
        expect(JSON.parse(call(fetcher)[1].body as string)).toEqual({widget_key: KEY, mode: "text", visitor_token: "v", contact: {name: "Aziz"}, test: false});
    });

    test("an agent's id brings only itself", async () => {
        const fetcher = answering(200, {data: {token: "t", url: "wss://x", voice: true}});
        await new WidgetApi("https://x.uz", {agentId: "agent_1"}, fetcher).session({mode: "voice", visitorToken: null, contact: {}, test: true});
        expect(JSON.parse(call(fetcher)[1].body as string)).toEqual({agent_id: "agent_1", mode: "voice"});
    });
});

describe("the server saying no", () => {
    test("comes with its code and the fields it was about", async () => {
        const api = new WidgetApi("https://x.uz", {widgetKey: KEY}, answering(422, {error: {code: "invalid_request", message: "No", fields: {"contact.name": "Enter it"}}}));
        const refusal = await api.session({mode: "text", visitorToken: null, contact: {}, test: false}).catch((error: unknown) => error);
        expect(refusal).toBeInstanceOf(WidgetApiError);
        expect(refusal).toMatchObject({status: 422, code: "invalid_request", fields: {"contact.name": "Enter it"}});
    });

    test("a network that's down says unavailable, and an answer that isn't JSON doesn't throw anything else", async () => {
        const down = new WidgetApi("https://x.uz", {widgetKey: KEY}, vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline"))));
        await expect(down.settings(null, null)).rejects.toMatchObject({status: 0, code: "unavailable"});
        const garbled = new WidgetApi("https://x.uz", {widgetKey: KEY}, vi.fn<typeof fetch>(() => Promise.resolve(new Response("<html>", {status: 500}))));
        await expect(garbled.settings(null, null)).rejects.toMatchObject({status: 500, code: "unavailable"});
    });
});

test("the log asks by position, with the visitor in a header", async () => {
    const fetcher = answering(200, {data: {messages: [], has_more: false, status: null, conversation_id: null}});
    await new WidgetApi("https://x.uz", {widgetKey: KEY}, fetcher).messages("v", {before: 9});
    const [url, init] = call(fetcher);
    expect(url).toBe(`https://x.uz/api/agents/v1/widgets/${KEY}/messages?before=9`);
    expect((init.headers as Record<string, string>)["X-Visitor-Token"]).toBe("v");
});

test("a file goes up with the conversation's resume token", async () => {
    const fetcher = answering(201, {data: {message: {id: 1}}});
    const message = await new WidgetApi("https://x.uz", {widgetKey: KEY}, fetcher).upload("conv_1", "resume", new File(["x"], "a.txt"), {clientMessageId: "c1", caption: "Mana", replyToMessageId: 3});
    const [url, init] = call(fetcher);
    expect(url).toBe("https://x.uz/api/agents/v1/conversations/conv_1/attachments");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer resume");
    const form = init.body as FormData;
    expect([form.get("client_message_id"), form.get("caption"), form.get("reply_to_message_id")]).toEqual(["c1", "Mana", "3"]);
    expect(message).toEqual({id: 1});
});
