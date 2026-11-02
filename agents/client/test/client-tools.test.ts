import {describe, expect, test, vi} from "vitest";
import {Conversation} from "../src/index";
import type {SessionOptions} from "../src/index";
import {fakeSockets, metadata, recorder} from "./fake-socket";
import {clientFrames, loadFixture, replay} from "./replay";

const call = (overrides: Record<string, unknown> = {}) => ({
    type: "client_tool_call", tool_call_id: "t1", tool_name: "open_cart", parameters: {sku: "A-7"}, expects_response: true, ...overrides,
});

async function opened(clientTools: SessionOptions["clientTools"]) {
    const sockets = fakeSockets();
    const {calls, callbacks} = recorder();
    const starting = Conversation.startSession({token: "tok", WebSocket: sockets.factory, clientTools, ...callbacks});
    sockets.socket.open();
    sockets.socket.serverSends(metadata());
    await starting;
    return {sockets, calls};
}

const results = (sockets: ReturnType<typeof fakeSockets>) =>
    (sockets.socket.sentJson() as Record<string, unknown>[]).filter((frame) => frame.type === "client_tool_result");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("client tools", () => {
    test("declares its tools in the handshake", () => {
        const sockets = fakeSockets();
        void Conversation.startSession({token: "tok", WebSocket: sockets.factory, clientTools: {open_cart: () => "ok"}});
        sockets.socket.open();
        expect(sockets.socket.sentJson()[0]).toMatchObject({type: "conversation_initiation_client_data", client_tools: ["open_cart"]});
    });

    test("answers a call with its handler's result", async () => {
        const handler = vi.fn((parameters: Record<string, unknown>) => Promise.resolve({ok: true, sku: parameters.sku}));
        const {sockets} = await opened({open_cart: handler});
        sockets.socket.serverSends(call());
        await settle();
        expect(handler).toHaveBeenCalledWith({sku: "A-7"});
        expect(results(sockets)).toEqual([{type: "client_tool_result", tool_call_id: "t1", result: '{"ok":true,"sku":"A-7"}', is_error: false}]);
    });

    test("sends a text result as it is", async () => {
        const {sockets} = await opened({open_cart: () => "Savat ochildi"});
        sockets.socket.serverSends(call());
        await settle();
        expect(results(sockets)[0]).toMatchObject({result: "Savat ochildi", is_error: false});
    });

    test("a handler that throws answers with is_error and its message", async () => {
        const {sockets} = await opened({open_cart: () => {
            throw new Error("The cart is empty.");
        }});
        sockets.socket.serverSends(call());
        await settle();
        expect(results(sockets)).toEqual([{type: "client_tool_result", tool_call_id: "t1", result: "The cart is empty.", is_error: true}]);
    });

    test("a call that expects no response gets none", async () => {
        const handler = vi.fn(() => "ok");
        const {sockets} = await opened({open_cart: handler});
        sockets.socket.serverSends(call({expects_response: false}));
        await settle();
        expect(handler).toHaveBeenCalledOnce();
        expect(results(sockets)).toEqual([]);
    });

    test("a call for a tool the page doesn't run answers is_error and tells the app", async () => {
        const {sockets, calls} = await opened({other_tool: () => "ok"});
        sockets.socket.serverSends(call());
        await settle();
        expect(results(sockets)).toEqual([{type: "client_tool_result", tool_call_id: "t1", result: "This page has no tool called open_cart.", is_error: true}]);
        expect(calls.onUnhandledClientToolCall).toEqual([[{toolCallId: "t1", toolName: "open_cart", parameters: {sku: "A-7"}, expectsResponse: true}]]);
    });

    test("a long result is cut to 8,000 characters", async () => {
        const {sockets} = await opened({open_cart: () => "x".repeat(9000)});
        sockets.socket.serverSends(call());
        await settle();
        expect(String(results(sockets)[0]?.result)).toHaveLength(8000);
    });

    test("replays client-tool", async () => {
        vi.useFakeTimers();
        try {
            const recorded = loadFixture("client-tool");
            const {ids} = await import("./fake-socket");
            const {sent} = await replay(recorded, {idGenerator: ids("c-1"), clientTools: {open_cart: () => ({items: 2})}});
            expect(sent).toEqual(clientFrames(recorded));
        } finally {
            vi.useRealTimers();
        }
    });
});
