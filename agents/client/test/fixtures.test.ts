import {expect, test} from "vitest";
import {clientFrames, expectedMessages, loadFixture, replay} from "./replay";
import {ids} from "./fake-socket";

test.each(["new-conversation", "handoff", "debug", "ended", "resume", "refused-message", "unknown-event"])("replays %s", async (name) => {
    const recorded = loadFixture(name);
    const {sent, calls} = await replay(recorded, {idGenerator: ids("c-1", "c-2")});
    expect(sent).toEqual(clientFrames(recorded));
    expect(calls.onMessage.map(([message]) => message.message)).toEqual(expectedMessages(recorded));
});

test("a streamed reply reaches its callbacks part by part, then whole", async () => {
    const {calls} = await replay(loadFixture("new-conversation"), {idGenerator: ids("c-1")});
    expect(calls.onAgentTyping).toHaveLength(1);
    expect(calls.onAgentChatResponsePart.map(([part]) => [part.eventId, part.type, part.text])).toEqual([
        [2, "start", ""], [2, "delta", "Toshkent boʻylab "], [2, "delta", "yetkazib berish bepul."], [2, "stop", ""],
    ]);
    expect(calls.onMessage.at(-1)?.[0]).toEqual({source: "ai", message: "Toshkent boʻylab yetkazib berish bepul.", eventId: 2});
});

test("a withdrawn reply, the holding message and the handoff reach their callbacks", async () => {
    const {calls} = await replay(loadFixture("handoff"), {idGenerator: ids("c-1")});
    expect(calls.onAgentResponseCorrection).toEqual([[{eventId: 2, text: ""}]]);
    expect(calls.onHandoff).toEqual([[{reason: "agent_failed"}]]);
});

test("a resume shows its history, another viewer's message and an operator's reply", async () => {
    const {calls} = await replay(loadFixture("resume"));
    expect(calls.onHistory[0]?.[0].map((m) => m.role)).toEqual(["customer", "agent"]);
    expect(calls.onMessage.map(([m]) => m.source)).toEqual(["user", "operator"]);
    expect(calls.onMessage[1]?.[0]).toMatchObject({operator: {name: "Aziz", avatar_url: null}, eventId: 5});
});

test("a tester's turn_debug reaches onDebug, and an error event onError", async () => {
    const debug = await replay(loadFixture("debug"), {idGenerator: ids("c-1")});
    expect(debug.calls.onDebug[0]?.[0]).toMatchObject({type: "turn_debug", model: "gemma-4-26b-a4b"});
    const unknown = await replay(loadFixture("unknown-event"));
    expect(unknown.calls.onError).toEqual([["user_activity isn't an event of this protocol version.", {code: "unknown_event"}]]);
});
