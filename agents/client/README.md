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
