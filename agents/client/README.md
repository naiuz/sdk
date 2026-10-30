# @naiuz/agents

The client for NeuronAI agents. It talks to an agent over the [agents protocol](../../spec/agents/protocol.md), a WebSocket protocol, in text conversations and voice calls.

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
- **Options:** `serverUrl` defaults to `wss://my.neuronai.uz/api/v1/realtime`. `WebSocket` lets another runtime supply its own; the default is `globalThis.WebSocket`, which browsers and Node 22 have. `textOnly`, `output` and `audio` make a call (see [Voice calls](#voice-calls)).

## Voice calls

A call is a session with `textOnly: false`. Start it from a click or a tap: the browser lets the microphone and the audio start only inside the user's gesture.

```ts
let conversation: Conversation;
button.onclick = async () => {
    conversation = await Conversation.startSession({
        token,
        textOnly: false,
        onModeChange: ({mode}) => console.log(mode), // listening, thinking or speaking
        onMessage: (message) => console.log(message), // what the customer said comes with spoken: true
    });
};

// While the call runs:
conversation.setMicMuted(true); // the call goes on, and the agent hears silence
conversation.setVolume({volume: 0.5});
const level = conversation.getOutputVolume(); // 0 to 1, for a visualizer; getInputVolume() for the microphone
```

- **The microphone** is asked for before the call connects, so a refused one never takes a voice line. `startSession` then rejects with a `MicrophoneError`, whose `cause` is the browser's error:
  - `NotAllowedError`: the user or the browser refused it;
  - `NotFoundError`: there is no microphone;
  - `NotReadableError`: another app holds it;
  - a `TypeError`: the page isn't secure (https, or localhost).
- **In the browser,** `BrowserAudio` does the audio: one AudioContext at the device's rate, an AudioWorklet that takes the microphone (echo-cancelled, denoised, mono) to 16 kHz, and one that plays the agent. The agent plays through an `<audio>` element, which the browser's echo canceller hears. Pass `audio: new BrowserAudio({inputStream})` to send a recording in place of the microphone.
- **Content Security Policy:** the worklets load from a `blob:` URL the client makes, so a strict policy must allow `blob:` in `script-src` (or `worklet-src`).
- **Outside a browser,** pass `audio`, an `AudioIO` of your own: the microphone in, the agent's voice out.
- **Audio:** the call asks for the agent's voice at 24 kHz (`output: "pcm_16000"` asks for 16 kHz), and plays it at the rate the server answers with.
- **What it sends:** the microphone in 20 ms frames, and playback reports, so the server knows what the customer heard when they speak over the agent. After a network stall it drops the audio the socket couldn't take rather than send it late.
- **Interruptions:** when the customer speaks over a reply, its audio pauses, then resumes or stops as the server decides. `onAgentResponseCorrection` then gets the part of the reply the customer heard.
- **Refusals:** before the call starts, `startSession` rejects with a `SessionError`: 4003 when the token doesn't allow voice, 4009 when every line is busy, 4010 when the balance can't cover a minute of voice.
- **Ending:** `endSession()` hangs up, and the conversation goes on as chat.
  - A call another connection takes over ends with `onDisconnect` code 4008.
  - A call that reaches the agent's max duration ends with code 1000 and message `max_duration`. To go on in chat, start a text session with `getResumeToken()`.
- **Reconnecting:** a call that loses its connection resumes as a call. The reply it was playing is dropped.

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
