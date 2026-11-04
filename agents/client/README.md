# @naiuz/agents

The client for NeuronAI agents. It talks to an agent over the [agents protocol](../../spec/agents/protocol.md), a WebSocket protocol, in text conversations and voice calls.

```ts
import {Conversation} from "@naiuz/agents";

const conversation = await Conversation.startSession({
    agentId: "agent_01JB8Z5R4Q6Y2N7K3M9D0F1H2J",
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
- **`ConversationController`** holds a session's state and methods for a framework to sit on: `subscribe`, `getSnapshot`, and everything below. The Vue package is built on it.
- **Options:** `serverUrl` defaults to `wss://my.neuronai.uz/api/v1/realtime`. `WebSocket` lets another runtime supply its own; the default is `globalThis.WebSocket`, which browsers and Node 22 have. `textOnly`, `output` and `audio` make a call (see [Voice calls](#voice-calls)).

## Telling the agent what's going on

```ts
conversation.sendContextualUpdate("The customer is on the delivery page.", {contextId: "page"});
conversation.sendUserActivity();
conversation.sendFeedback(eventId, "like");
```

- **`sendContextualUpdate`** interrupts nothing. The agent reads it at its next turn, as information and never as instructions. A newer update with the same `contextId` replaces the older one, and the agent keeps the last 20. Said while the connection is down, it goes out when it's back.
- **`sendUserActivity`** says the customer is typing: a reply that hasn't started holds off for about 2 seconds, and 8 at most. In a call it puts off the silence check-in. Call it on every key: it goes out at most once a second.
- **`sendFeedback`** rates a reply by the `eventId` its `onMessage` gave, with `"like"`, `"dislike"`, or `null` to take it back. It returns false once the session is over, when it can't go anywhere, so hide the thumbs then.
- **`onAgentToolResponse`** says which tool the agent is using and how it's going, never its values or its result. **`onLanguageChange`** says it moved to another language. **`onInterruption`** says the customer spoke over a reply in a call.

## Starting a session

A session starts from exactly one of these:

- **`agentId`,** for a public agent, on a page of one of its allowed websites. The client asks for the session itself, and a call asks after the microphone. A refusal rejects with a `SessionRefusedError`, whose `code` says why: `origin_not_allowed`, `private_agent`, `daily_limit_reached`, `insufficient_balance` or `not_found`, or `unavailable` when the server couldn't answer.
- **`signedUrl`,** a link your server makes with an API key, for any of your agents. It opens one conversation, within 15 minutes. A second use rejects with a `SessionError`, 4003 `link_used`. `customer_id` in the query is your own id for this customer, and their conversations share one contact.
- **`token`,** a session token from your backend or the dashboard, or a resume token.

`apiUrl` is where `agentId` asks, and defaults to `https://my.neuronai.uz`.

`overrides` changes `prompt`, `firstMessage`, `language`, `voice`, `model` or `textOnly` for this session. The agent's Security tab allows each one, all are off by default, and one it doesn't allow closes the session with 4003. The browser holds the session, so anyone who can start one can set what's allowed. To change something for one customer from your server, use `vars` in a signed link.

`userId` is what your page calls this customer, kept as a label. Anyone can send anything here, so it identifies nobody.

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
- **Content Security Policy:** the worklets load from a `blob:` URL the client makes, so a strict policy must allow `blob:` in `script-src` (or in `script-src-elem`, which browsers check for worklets first).
- **Errors:** a failure that isn't the microphone's, such as a worklet a policy blocks, rejects with its own error, not a `MicrophoneError`.
- **One session each:** a `BrowserAudio` serves one session, and the session's end closes it. The client makes a new one for each session; one you pass is the session's to close.
- **Outside a browser,** pass `audio`, an `AudioIO` of your own: the microphone in, the agent's voice out.
- **Audio:** the call asks for the agent's voice at 24 kHz (`output: "pcm_16000"` asks for 16 kHz), and plays it at the rate the server answers with.
- **What it sends:** the microphone in 20 ms frames, and playback reports, so the server knows what the customer heard when they speak over the agent. After a network stall it drops the audio the socket couldn't take rather than send it late.
- **Interruptions:** when the customer speaks over a reply, its audio pauses, then resumes or stops as the server decides. `onAgentResponseCorrection` then gets the part of the reply the customer heard.
- **Refusals:** before the call starts, `startSession` rejects with a `SessionError`: 4003 when the token doesn't allow voice, 4009 when every line is busy, 4010 when the balance can't cover a minute of voice.
- **Ending:** `endSession()` hangs up, and the conversation goes on as chat.
  - A call another connection takes over ends with `onDisconnect` code 4008.
  - A call that reaches the agent's max duration ends with code 1000 and message `max_duration`. To go on in chat, start a text session with `getResumeToken()`.
- **Devices:** `changeInputDevice({deviceId})` moves the call to another microphone without dropping it, and `changeOutputDevice({deviceId})` to another speaker, in browsers that can choose one. When it can't, it rejects and the call stays on what it has. A microphone that stops mid-call calls `onError` with the code `microphone_lost`, and the call goes on.
- **Reconnecting:** a call that loses its connection resumes as a call. The reply it was playing is dropped.

### A voice call in the browser

`examples/voice-call.html` holds a call with an agent through a local engine, with the agent orb from `@naiuz/agents-vue`:

1. Build the packages: `npm run build` in `agents/`.
2. Copy the engine's `tests/fixtures/audio/uz-delivery.wav` and `uz-long.wav` beside the page, to stand in for the microphone.
3. Serve this repository's root, `python3 -m http.server 8766 --bind 127.0.0.1`, and open `http://127.0.0.1:8766/agents/client/examples/voice-call.html`. 127.0.0.1 is a secure context, so the browser lets the page use the microphone.
4. Paste a voice token from the dashboard (`php artisan agents:preview-token <agent> --user=<id> --voice`), choose the microphone or a recording, and start the call.

The page shows the orb, the agent's state, the transcript with each reply cut to what was heard, each reply's audio received and played, and the server's events. "Speak over the reply" plays `uz-long.wav` over the agent's reply, or over the next one when the agent isn't speaking.

## Client tools

A client tool runs in your page, when the agent asks: opening the cart, filling a form, reading what the page shows. Define it on the agent, then give the session a handler for it:

```ts
const conversation = await Conversation.startSession({
    token,
    clientTools: {
        open_cart: async ({highlight_sku}) => {
            await cart.open(highlight_sku as string | undefined);
            return {items: cart.count()};
        },
    },
    onUnhandledClientToolCall: (call) => console.warn("No handler for", call.toolName),
});
```

- Name each handler as the tool is named on the agent, in snake_case; a page runs at most 32. `startSession` rejects with a `TypeError` that names a handler it can't declare.
- With the conversation open in several tabs, a call goes to one of them: the tab the customer last wrote or called from, when it has the handler.
- The handler gets the values the agent filled.
- What it returns is what the agent reads: text as it is, anything else as JSON, cut to 8,000 characters.
- If it throws, the agent learns the call failed, with the error's message.
- When the tool doesn't wait for its result, the agent goes on at once and the return value is ignored.
- A call to a tool the page has no handler for is answered with an error, and fires `onUnhandledClientToolCall`.

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
