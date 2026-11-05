import {createElement} from "react";
import {renderToString} from "react-dom/server";
import {expect, test} from "vitest";
import {AgentOrb, useConversation} from "../src/index";
import type {UseConversation} from "../src/index";

function firstRender(): UseConversation {
    const seen: {conversation?: UseConversation} = {};
    function Page() {
        seen.conversation = useConversation();
        return null;
    }
    renderToString(createElement(Page));
    if (seen.conversation === undefined) throw new Error("the page didn't render");
    return seen.conversation;
}

test("a page renders on the server with no session", () => {
    expect(firstRender()).toMatchObject({status: "disconnected", mode: null, conversationStatus: null, micMuted: false, isSpeaking: false});
});

test("it gives every method the client has", () => {
    const conversation = firstRender() as unknown as Record<string, unknown>;
    for (const method of ["startSession", "endSession", "sendUserMessage", "sendContextualUpdate", "sendUserActivity", "sendFeedback", "setMicMuted", "setVolume", "getInputVolume", "getOutputVolume", "changeInputDevice", "changeOutputDevice", "getId", "getResumeToken"]) {
        expect(conversation[method]).toBeTypeOf("function");
    }
});

test("with no session a message is refused, and the rest do nothing", async () => {
    const conversation = firstRender();
    await expect(conversation.sendUserMessage("Salom")).rejects.toThrow(/Start a session/);
    expect(conversation.getId()).toBe("");
    expect(conversation.getInputVolume()).toBe(0);
});

test("the orb is hidden from screen readers, and renders as Vue's does", () => {
    const html = renderToString(createElement(AgentOrb, {state: "speaking"}));
    expect(html).toMatch(/^<div class="naiuz-orb" aria-hidden="true"/);
    expect(html).toContain("<canvas");
    expect(html).toContain("radial-gradient(circle, #FF9A14 0%, #FFC56E 45%, transparent 72%)");
});

test("its size is clamped to 24 to 210 px, and its colours are the customer's", () => {
    const width = (size: number) => renderToString(createElement(AgentOrb, {size})).match(/width:(\d+)px/)?.[1];
    expect([width(10), width(132), width(500)]).toEqual(["24", "132", "210"]);
    expect(renderToString(createElement(AgentOrb, {colors: ["#0ea5e9", "#a5f3fc"]}))).toContain("radial-gradient(circle, #0ea5e9 0%, #a5f3fc 45%, transparent 72%)");
});
