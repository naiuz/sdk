import {afterEach, describe, expect, test, vi} from "vitest";
import {Conversation, SessionRefusedError} from "../src/index";
import {FakeAudio} from "./fake-audio";
import {fakeSockets, metadata} from "./fake-socket";

const AGENT = "agent_01JB8Z5R4Q6Y2N7K3M9D0F1H2J";
const GRANTED = {data: {token: "tok", url: "wss://engine.example/realtime", expires_at: "2026-11-04T10:00:00Z", voice: true}, request_id: "req_1"};
const LINK = "wss://engine.example/realtime?token=signed";

afterEach(() => {
    vi.useRealTimers();
});

/** The public endpoint: it answers with the body it is given and records what it was asked. */
function fakeFetch(status: number, body: unknown) {
    const asked: {url: string; init: RequestInit}[] = [];
    const fetch = (url: string, init: RequestInit): Promise<Response> => {
        asked.push({url, init});
        return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), {status}));
    };
    return {fetch: fetch as unknown as typeof globalThis.fetch, asked};
}

function refusal(code: string, message: string): object {
    return {error: {type: "invalid_request_error", code, message, param: null}, request_id: "req_1"};
}

describe("starting from an agent's id", () => {
    test("asks the public endpoint for a text session, and connects where it says with what it gave", async () => {
        const sockets = fakeSockets();
        const endpoint = fakeFetch(200, GRANTED);
        const started = Conversation.startSession({agentId: AGENT, WebSocket: sockets.factory, fetch: endpoint.fetch});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        expect(endpoint.asked).toHaveLength(1);
        expect(endpoint.asked[0]?.url).toBe("https://my.neuronai.uz/api/agents/v1/sessions");
        expect(endpoint.asked[0]?.init.method).toBe("POST");
        expect(JSON.parse(endpoint.asked[0]?.init.body as string)).toEqual({agent_id: AGENT, mode: "text"});
        expect(sockets.socket.url).toBe("wss://engine.example/realtime?token=tok");
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        await expect(started).resolves.toBeInstanceOf(Conversation);
    });

    test("asks another host when told to", async () => {
        const sockets = fakeSockets();
        const endpoint = fakeFetch(200, GRANTED);
        void Conversation.startSession({agentId: AGENT, apiUrl: "http://localhost:8001/", WebSocket: sockets.factory, fetch: endpoint.fetch});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        expect(endpoint.asked[0]?.url).toBe("http://localhost:8001/api/agents/v1/sessions");
    });

    test("a socket address the app gives wins over the answer's", async () => {
        const sockets = fakeSockets();
        const endpoint = fakeFetch(200, GRANTED);
        void Conversation.startSession({agentId: AGENT, serverUrl: "ws://localhost:8090/realtime", WebSocket: sockets.factory, fetch: endpoint.fetch});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        expect(sockets.socket.url).toBe("ws://localhost:8090/realtime?token=tok");
    });

    test("a call asks after the microphone, since a token lasts a minute and a prompt can take longer", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const endpoint = fakeFetch(200, GRANTED);
        const heardBeforeAsking: string[] = [];
        const asking: typeof globalThis.fetch = (url, init) => {
            heardBeforeAsking.push(...audio.calls.map(({call}) => call));
            return endpoint.fetch(url, init);
        };
        void Conversation.startSession({agentId: AGENT, textOnly: false, audio, WebSocket: sockets.factory, fetch: asking});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        expect(heardBeforeAsking).toContain("startCapture");
        expect(JSON.parse(endpoint.asked[0]?.init.body as string)).toEqual({agent_id: AGENT, mode: "voice"});
    });

    test.each([
        [403, "origin_not_allowed", "This website isn't on the agent's list of allowed websites."],
        [403, "private_agent", "This agent only works through a signed link."],
        [429, "daily_limit_reached", "This agent has reached its limit of conversations for today."],
        [402, "insufficient_balance", "Your balance can't cover a minute of voice."],
        [404, "not_found", "No such agent."],
    ])("a %i says why it was refused: %s", async (status, code, message) => {
        const sockets = fakeSockets();
        const statuses: string[] = [];
        const started = Conversation.startSession({
            agentId: AGENT, WebSocket: sockets.factory, fetch: fakeFetch(status, refusal(code, message)).fetch,
            onStatusChange: (change) => statuses.push(change.status),
        });
        const error: unknown = await started.catch((refused: unknown) => refused);
        expect(error).toBeInstanceOf(SessionRefusedError);
        expect(error).toMatchObject({code, status, message});
        expect(sockets.opened).toBe(0);
        expect(statuses).toEqual(["connecting", "disconnected"]);
    });

    test("a refusal lets the microphone go", async () => {
        const audio = new FakeAudio();
        const started = Conversation.startSession({
            agentId: AGENT, textOnly: false, audio, WebSocket: fakeSockets().factory,
            fetch: fakeFetch(403, refusal("origin_not_allowed", "No.")).fetch,
        });
        await expect(started).rejects.toBeInstanceOf(SessionRefusedError);
        expect(audio.calls.map(({call}) => call)).toContain("close");
    });

    test("a network that fails is unavailable, not a refusal of the agent", async () => {
        const failing = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof globalThis.fetch;
        const started = Conversation.startSession({agentId: AGENT, WebSocket: fakeSockets().factory, fetch: failing});
        await expect(started).rejects.toMatchObject({name: "SessionRefusedError", code: "unavailable", status: 0});
    });

    test.each([
        ["a page that isn't JSON", 502, "<html>Bad gateway</html>"],
        ["an answer with no token", 200, {data: {url: "wss://engine.example/realtime"}, request_id: "r"}],
        ["an answer with no address", 200, {data: {token: "tok"}, request_id: "r"}],
        ["JSON that isn't an object", 200, "null"],
        ["an error with no code", 500, {error: {}, request_id: "r"}],
    ])("%s is unavailable", async (_name, status, body) => {
        const sockets = fakeSockets();
        const started = Conversation.startSession({agentId: AGENT, WebSocket: sockets.factory, fetch: fakeFetch(status, body).fetch});
        await expect(started).rejects.toMatchObject({name: "SessionRefusedError", code: "unavailable", status});
        expect(sockets.opened).toBe(0);
    });
});

describe("starting from a signed link", () => {
    test("connects to the link as it is, and asks nothing", async () => {
        const sockets = fakeSockets();
        const endpoint = fakeFetch(500, "unused");
        const started = Conversation.startSession({signedUrl: LINK, WebSocket: sockets.factory, fetch: endpoint.fetch});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        expect(endpoint.asked).toEqual([]);
        expect(sockets.socket.url).toBe(LINK);
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        await expect(started).resolves.toBeInstanceOf(Conversation);
    });

    test("reconnects at the link's address with the resume token, since the link is spent", async () => {
        vi.useFakeTimers();
        const sockets = fakeSockets();
        const started = Conversation.startSession({signedUrl: LINK, WebSocket: sockets.factory});
        await vi.advanceTimersByTimeAsync(0);
        sockets.socket.open();
        sockets.socket.serverSends(metadata());
        await started;
        sockets.socket.serverCloses(1006, "");
        await vi.advanceTimersByTimeAsync(250);
        expect(sockets.opened).toBe(2);
        expect(sockets.socket.url).toBe("wss://engine.example/realtime?token=resume-1");
    });

    test("a link used before says so in its close", async () => {
        const sockets = fakeSockets();
        const started = Conversation.startSession({signedUrl: LINK, WebSocket: sockets.factory});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        sockets.socket.open();
        sockets.socket.serverCloses(4003, "link_used");
        await expect(started).rejects.toMatchObject({name: "SessionError", code: 4003, reason: "link_used"});
    });

    test("something that isn't an address is rejected before anything starts", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        const started = Conversation.startSession({signedUrl: "not a link", textOnly: false, audio, WebSocket: sockets.factory});
        await expect(started).rejects.toBeInstanceOf(TypeError);
        expect(audio.calls).toEqual([]);
        expect(sockets.opened).toBe(0);
    });
});

describe("how a session starts", () => {
    test.each([
        ["nothing", {}],
        ["a token and an agent's id", {token: "tok", agentId: AGENT}],
        ["an agent's id and a link", {agentId: AGENT, signedUrl: LINK}],
        ["all three", {token: "tok", agentId: AGENT, signedUrl: LINK}],
    ])("%s is rejected: it takes exactly one", async (_name, start) => {
        const sockets = fakeSockets();
        await expect(Conversation.startSession({...start, WebSocket: sockets.factory})).rejects.toBeInstanceOf(TypeError);
        expect(sockets.opened).toBe(0);
    });
});

describe("overrides", () => {
    test("sends all six under the protocol's names", () => {
        const sockets = fakeSockets();
        void Conversation.startSession({
            token: "tok", WebSocket: sockets.factory,
            overrides: {
                prompt: "Sen sotuvchisan.", firstMessage: "Salom!", language: "ru",
                voice: {id: "omnivoice:madina", speed: 1.1}, model: {source: "neuronai", id: "gemma-4"}, textOnly: true,
            },
        });
        sockets.socket.open();
        expect(sockets.socket.sentJson()).toEqual([{
            type: "conversation_initiation_client_data",
            overrides: {
                prompt: "Sen sotuvchisan.", first_message: "Salom!", language: "ru",
                voice: {id: "omnivoice:madina", speed: 1.1}, model: {source: "neuronai", id: "gemma-4"}, text_only: true,
            },
            text_only: true,
        }]);
    });

    test("sends only what it was given", () => {
        const sockets = fakeSockets();
        void Conversation.startSession({token: "tok", WebSocket: sockets.factory, overrides: {prompt: "Qisqa javob ber."}});
        sockets.socket.open();
        expect(sockets.socket.sentJson()).toMatchObject([{overrides: {prompt: "Qisqa javob ber."}}]);
        expect(Object.keys((sockets.socket.sentJson()[0] as {overrides: object}).overrides)).toEqual(["prompt"]);
    });

    test("a text only override keeps the page from a call, so no microphone is asked for", () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        void Conversation.startSession({token: "tok", textOnly: false, audio, WebSocket: sockets.factory, overrides: {textOnly: true}});
        expect(audio.calls).toEqual([]);
        sockets.socket.open();
        expect(sockets.socket.sentJson()).toEqual([{type: "conversation_initiation_client_data", overrides: {text_only: true}, text_only: true}]);
    });

    test("a text only override of false makes the session a call", async () => {
        const sockets = fakeSockets();
        const audio = new FakeAudio();
        void Conversation.startSession({token: "tok", audio, WebSocket: sockets.factory, overrides: {textOnly: false}});
        await vi.waitFor(() => {
            expect(sockets.opened).toBe(1);
        });
        expect(audio.calls.map(({call}) => call)).toContain("startCapture");
        sockets.socket.open();
        expect(sockets.socket.sentJson()).toMatchObject([{overrides: {text_only: false}, text_only: false}]);
    });
});
