// A scripted conversation through the agents socket, for local runs against an engine:
//
//   node agents/client/examples/preview-chat.mjs --url ws://localhost:8080/api/v1/realtime --token <token> "Salom" "Yetkazib berish qancha?"
//
// It needs Node 22 or later, for its WebSocket, and the built client (npm run build in agents/).
// --pause <ms> waits between messages, long enough to restart the engine and watch the client resume.
import {Conversation} from "../dist/index.js";

const args = process.argv.slice(2);

function option(name, fallback) {
    const at = args.indexOf(`--${name}`);
    if (at === -1) return fallback;
    const [, value] = args.splice(at, 2);
    return value;
}

const serverUrl = option("url", "ws://localhost:8080/api/v1/realtime");
const token = option("token", "");
const pauseMs = Number(option("pause", "0"));
const messages = args;
if (token === "" || messages.length === 0) {
    console.error("usage: preview-chat.mjs --url <ws url> --token <token> [--pause <ms>] <message>…");
    process.exit(2);
}

// The reply the script waits on, and the message it answers (null for the first message).
let waiting = null;
const reply = (after, withinMs) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no reply in time")), withinMs);
    waiting = {
        after,
        resolve: (text) => {
            clearTimeout(timer);
            waiting = null;
            resolve(text);
        },
    };
});

const firstMessage = reply(null, 3000).catch(() => null);
const conversation = await Conversation.startSession({
    token,
    serverUrl,
    onConnect: ({conversationId}) => console.log(`connected: ${conversationId}`),
    onStatusChange: ({status}) => console.log(`status: ${status}`),
    onMessage: ({source, message}) => {
        console.log(`${source}: ${message}`);
        if (source === "ai") waiting?.resolve(message);
    },
    onHistory: (history) => {
        console.log(`history: ${history.length} messages`);
        const last = history.at(-1);
        const asked = history.findLast((line) => line.role === "customer");
        // A reply that arrived while the client was away comes back in the history.
        if (waiting !== null && last?.role === "agent" && asked?.text === waiting.after) waiting.resolve(last.text);
    },
    onHandoff: ({reason}) => console.log(`handoff: ${reason}`),
    onError: (message, {code}) => console.error(`error ${code}: ${message}`),
});

await firstMessage;
for (const [index, text] of messages.entries()) {
    if (index > 0 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const answer = reply(text, 60_000);
    const ack = await conversation.sendUserMessage(text);
    console.log(`you (saved as ${String(ack.messageId)}): ${text}`);
    await answer;
}
await conversation.endSession();
