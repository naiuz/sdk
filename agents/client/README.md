# @naiuz/agents

The client for NeuronAI agents. It talks to an agent over the [agents protocol](../../spec/agents/protocol.md), a WebSocket protocol: text conversations today, voice in a later 0.x version.

```ts
import {Conversation} from "@naiuz/agents";

const conversation = await Conversation.startSession({
    token, // a session token from NeuronAI, which your backend or the dashboard gets
    onMessage: ({source, message}) => console.log(source, message),
    onAgentChatResponsePart: ({type, text}) => {
        if (type === "delta") process.stdout.write(text);
    },
    onHandoff: ({reason}) => console.log("operators have the conversation:", reason),
});

const ack = await conversation.sendUserMessage("Salom!");
console.log("saved as message", ack.messageId);

await conversation.endSession();
```

- **Callbacks:** `onConnect`, `onDisconnect`, `onStatusChange`, `onModeChange`, `onMessage`, `onAgentChatResponsePart`, `onAgentResponseCorrection`, `onAgentTyping`, `onHistory`, `onHandoff`, `onDebug` and `onError`. Their names follow `@elevenlabs/client` where they mean the same thing.
- **Options:** `serverUrl` defaults to `wss://my.neuronai.uz/api/v1/realtime`. `WebSocket` lets another runtime supply its own; the default is `globalThis.WebSocket`, which browsers and Node 22 have.

## Messages that fail

`sendUserMessage` rejects with a `MessageError` that has `clientMessageId`, `retryable` and `code`:
- **`invalid`:** the text is empty or longer than 10,000 characters, or the id is malformed. Nothing was sent.
- **`refused`:** the server won't save it. Sending it again won't help.
- **`unavailable` or `rate_limited`:** the server couldn't save it yet, three tries in a row, or the session ended before it could. When `retryable` is true, offer a Retry that sends it again with its id, so it is saved once:

```ts
await conversation.sendUserMessage(text, {clientMessageId: error.clientMessageId});
```

Another viewer's messages reach `onMessage` once each. The client drops the echo of its own messages, and a repeat after a reconnect.

## Reconnecting

- **When:** the client resumes the conversation by itself when the server drains (4012), restarts (1012, 1013), fails (1011), stops hearing from it (1001), or the network drops.
  - It also resumes when the socket has been silent for 40 seconds, since a half-open connection may never close.
  - It tries ten times, over about a minute, with randomized pauses, and then reports `onDisconnect` with `reason: "error"`.
- **After a reconnect:** `onHistory` gets the conversation so far. A message still waiting whose `clientMessageId` the history shows is saved: its send resolves from the history, after `onHistory`, and isn't sent again. Match it by `messageId`.
- **After a page reload:** keep `conversation.getResumeToken()` (it changes on every reconnect, so store it on each `onStatusChange` to `connected`), and pass it as `token` to resume the same conversation.

## A scripted conversation

`examples/preview-chat.mjs` holds a conversation through the socket, for local runs against an engine. Build the client first (`npm run build` in `agents/`), then:

```bash
node agents/client/examples/preview-chat.mjs --url ws://localhost:8080/api/v1/realtime --token "$TOKEN" "Salom" "Yetkazib berish qancha?"
```

It prints each status change, the first message, each saved message and each reply, and exits 0 after the last reply. `--pause <ms>` waits between messages, long enough to restart the engine and watch the client resume. In the dashboard, `php artisan agents:preview-token <agent> --user=<tester>` issues a preview token, good for 5 minutes.
