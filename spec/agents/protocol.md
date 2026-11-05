# The agents protocol, version 0.5

A client talks to a NeuronAI agent over one WebSocket. This document is the prose spec. The events themselves are defined in [`events.schema.json`](events.schema.json), which is the source of truth. [`fixtures/`](fixtures) holds recorded sessions that the SDKs and the engine both replay.

Version 0.1 covers text conversations and basic voice calls (see [Voice](#voice)). Version 0.2 adds [client tools](#client-tools). Version 0.3 adds contextual updates, user activity, feedback, tool status and language changes. Later 0.x versions add events and fields without changing the ones here.

## Connecting

- **The URL:** `wss://my.neuronai.uz/api/v1/realtime?token=…`.
- **The token** is either:
  - a session token: a short-lived JWS. A page on one of a public agent's allowed websites asks for one with the agent's id: `POST https://my.neuronai.uz/api/agents/v1/sessions` with `agent_id` and `mode` (`text` or `voice`) answers `data.token`, which opens one conversation within 60 seconds from that website, and `data.url`, the address to connect to. A refusal answers `error.code`: `origin_not_allowed`, `private_agent`, `daily_limit_reached` or `insufficient_balance`;
  - a signed link's token: `GET /api/v1/agents/{id}/signed-url` with an API key answers `data.signed_url`, the whole address to connect to, for any agent of the key's organization. It opens one conversation, within 15 minutes. `customer_id` in the query is your own id for this customer, and their conversations share one contact. `vars` are values the page can't change, though it can read them: they travel in the link;
  - a resume token: one the server gave this conversation earlier (see [Resuming](#resuming)).
- **Frames:** every event is a JSON text frame with a `type` field. A call's audio travels in binary frames (see [Voice](#voice)).
- **The handshake:**
  1. The client sends `conversation_initiation_client_data` as its first frame, within 10 seconds.
  2. The server answers `conversation_initiation_metadata`.
  3. The conversation can then start. On a new conversation, the agent's first message arrives as an `agent_response`. On a resume, `conversation_history` arrives first.

The server accepts every connection and then closes it with a [close code](#close-codes) when it refuses it, because a browser can't read the HTTP status of a refused upgrade.

## Client events

| Event | Fields |
|---|---|
| `conversation_initiation_client_data` | All optional: `dynamic_variables` (values for the agent's variables; signed values in the token win), `overrides` (`prompt`, `first_message`, `language`, `voice`, `model`, `text_only`; only those the token allows. `text_only` here decides the session's mode, over the frame's own), `text_only` (`false` asks for a call; left out, the session is text), `audio` (a call's formats: `input` `pcm_16000`, `output` `pcm_16000` or `pcm_24000`), `user_id` (what your page calls this customer, kept as a label. Anyone can send anything here, so it identifies nobody: a signed link's `customer_id` does), `client_tools` (the names of the client tools this page runs, at most 32) |
| `user_message` | `client_message_id`: your own id for the message, `^[A-Za-z0-9_-]{1,64}$`, the same on every retry; `text`: 1 to 10,000 characters |
| `playback` | `event_id`, `played_ms`: milliseconds of that reply's audio played since its first frame, pauses excluded. Sent every 250 ms while it plays, once when it pauses (on `audio_pause` or `interruption`), and whenever its audio runs out, at its end or early after a stall, so the server knows what was heard |
| `pong` | `event_id`: the id of the `ping` it answers |
| `contextual_update` | `text`: 1 to 2,000 characters; `context_id`, optional: your own id for what it's about, `^[A-Za-z0-9_-]{1,64}$`. Something the page wants the agent to know, such as what the customer is looking at. It interrupts nothing, and the agent reads it at its next turn as information, never as instructions. A newer update with the same `context_id` replaces the older one. The agent keeps the last 20 |
| `user_activity` | The customer is typing: a reply that hasn't started holds off for about 2 seconds, and 8 at most. In a call it puts off the silence check-in, and interrupts nothing. Send it about once a second while they type. Past a limit the rest are dropped, and a flood of them closes with 4029 |
| `feedback` | `event_id`: the reply's; `score`: `like`, `dislike`, or null to take it back. An `event_id` that isn't one of this conversation's replies is ignored, and past a limit the rest are dropped |
| `client_tool_result` | `tool_call_id`: the call it answers; `result`: what the tool returned, as text (JSON for anything else), at most 8,000 characters; `is_error`: true when the tool couldn't do it, `result` saying why. The first answer to a call wins |

## Server events

| Event | Fields |
|---|---|
| `conversation_initiation_metadata` | `conversation_id`, `resume_token`, `status` (the conversation's status, such as `ai_handling` or `human_handling`), `languages`, `language`, `features` (`text`, `voice`, `debug`), `audio` (the call's formats, or null for a text session) |
| `conversation_history` | On a resume: `messages`, each `{role, text, at, message_id, client_message_id}`, oldest first. It includes replies that arrived while the client was away, and every message the customer sent, answered or not |
| `message_ack` | `client_message_id`, `message_id`, `occurred_at`: the message is saved |
| `message_error` | `client_message_id`, `retryable`, `code` (`refused`, `unavailable`, `invalid` or `rate_limited`): the message wasn't saved |
| `user_message` | `client_message_id`, `message_id`, `text`, `occurred_at`: a message another viewer of the conversation sent. After a reconnect the same message can arrive again: keep one per `message_id` |
| `agent_typing` | Shown before each reply, typed or spoken |
| `agent_chat_response_part` | `event_id`, `text_response_part` (`type`: `start`, `delta` or `stop`; `text`): one piece of a streamed reply |
| `agent_response` | `event_id`, `text`: the final text of a reply |
| `agent_response_correction` | `event_id`, `text`: replaces what you have of that reply. An empty text withdraws it. After an `interruption` it is the reply's final text: nothing more comes for that `event_id` |
| `guardrail_triggered` | `name`, `action` (`end`, `retry` or `transfer`): a check on the agent's reply or on the customer's message stopped a reply. It tells you the check's name and what happens next. On `retry` a new reply follows, on `transfer` a `handoff` does, and on `end` a `conversation_ended` does. A reply that had started is withdrawn with an `agent_response_correction` first |
| `agent_transferred` | `agent_id`, `agent_name`: another agent has the conversation now. Its reply follows, and the conversation stays the same one. |
| `operator_message` | `event_id`, `text`, `operator` (`name`, `avatar_url`): an operator's reply |
| `handoff` | `reason` (`agent`, `agent_failed` or `balance`), `mode_outcome` (`continue_as_text`): operators have the conversation now, and the agent stays silent |
| `turn_debug` | Only when the token allows debugging: how a turn ran, with its `event_id`, `turn_id`, `step`, `model`, `fallback_used`, `timings`, `usage`, `warnings` and `error_code`: null when the turn went through, otherwise why it failed (`model_timeout`, `model_unavailable`, `model_error`, `egress_blocked`, `config_invalid`, `config_unavailable`, `secret_missing`, `turn_expired` or `internal`; take a code you don't know as `internal`), and `tool_calls`: each tool call of the turn, secrets masked (`kind`, `name`, `arguments`, `result`, `status`, `error_code`, `http_status`, `duration_ms`) `knowledge` lists the passages of the agent's documents the model read, with their document, page and score. |
| `agent_tool_response` | `tool_name`, `tool_type` (`system`, `webhook`, `client`, `mcp`, `integration` or `transition`), `status` (`running`, `done` or `failed`): a tool the agent is using. It never carries the tool's values or result |
| `language_changed` | `language`: the agent moved to this language, and what it says from here on is in it |
| `client_tool_call` | `tool_call_id`, `tool_name`, `parameters` (the values the agent filled), `expects_response`. See [Client tools](#client-tools) |
| `agent_state` | In a call: `state` (`listening`, `thinking` or `speaking`), which drives the orb |
| `user_transcript` | In a call: `text`, `language`, `occurred_at`: what the customer said, once their turn ended. Every viewer gets it |
| `audio_pause` | In a call: `event_id`. The customer started speaking over that reply: pause its playback and keep the buffer |
| `audio_resume` | In a call: `event_id`. Nothing to answer was said: resume the paused reply where it stopped |
| `interruption` | In a call: `event_id`. Drop that reply's audio. An `agent_response_correction` follows with what was heard, and is the reply's last word |
| `ping` | `event_id`: answer with a `pong` carrying the same id |
| `conversation_ended` | `reason`. The server then closes with 1000 |
| `error` | `code` (`unknown_event`, `invalid_event` or `internal`), `message`: a frame the server couldn't use. The socket stays open |

`event_id`s count up per conversation, across its turns. A reply's parts, its final `agent_response` and any correction share one `event_id`. In a call, so do the reply's audio frames, the `playback` reports about it, and the `audio_pause`, `audio_resume` and `interruption` that act on it. The spoken first message's audio carries its `agent_response`'s `event_id`.

## Close codes

| Code | Meaning | What the client does |
|---|---|---|
| 1000 | Ended normally: the conversation ended, after `conversation_ended`; the client ended the session; or a call reached the agent's max duration (reason `max_duration`) | Stop. After `max_duration`, resume with `text_only: true` to go on chatting |
| 1001 | The server stopped hearing from the client: two pings went unanswered (reason `ping_timeout`), as when a phone suspends the page | Reconnect with the resume token |
| 1008 | A protocol error: no handshake within 10 seconds, or a first frame that isn't one | Stop, and fix the client |
| 1009 | A frame over 64 KB | Stop, and fix the client |
| 1011 | An internal error | Reconnect with the resume token, after a pause |
| 1012, 1013 | The web server restarted, or is overloaded. The gateway itself doesn't send these | Reconnect with the resume token, after a pause |
| 4001 | The token is invalid or expired | Stop. A session token must be fetched again; an expired resume token ends the conversation on this client |
| 4003 | Not allowed: the agent is paused or gone, an override the token doesn't allow, a call the token doesn't allow, a one-time token already used (reason `link_used`), a token given to another website (reason `origin_not_allowed`), or the agent's daily limit (reason `daily_limit`) | Stop |
| 4008 | Another connection took this conversation's call (reason `taken_over`) | Stop the call. The conversation goes on, in the other connection |
| 4009 | All voice lines are busy: the organization's or the platform's limit (reason `voice_limit`) | Stop the call, and offer text: "All lines are busy. Send a message instead." |
| 4010 | The balance can't cover one minute of voice (reason `balance`) | Stop the call, and show the reason |
| 4012 | The server is draining | Reconnect with the resume token. Before the metadata arrives, connect again with the same token: a server that is already draining opens nothing. A call starts again with a short notice |
| 4029 | Too many frames, or audio faster than twice real time | Stop |

## Sending messages

- **Saved means acked.** `message_ack` arrives once the message is stored. Until then, keep the message and its `client_message_id`.
- **Ids:** a `client_message_id` is unique within the conversation. The server stores a message once per `client_message_id`, so a retry never makes a duplicate. A repeat is acked with the same `message_id`.
- **Retrying:**
  - After a `message_error` with `retryable: true`, send the same message again with the same `client_message_id`, after a pause that grows each time.
  - After `retryable: false`, don't. The message stays unsent.
- **Invalid messages:** a `user_message` that breaks the rules above (an empty text, a text over 10,000 characters, a malformed id) gets `message_error` with `invalid` when the server can read its `client_message_id`, and an `error` with `invalid_event` when it can't. Check a message before sending it.
- **Order:** the server stores one connection's messages in the order they arrive.
- **Other viewers:** every other connection on the conversation gets the message as a server `user_message`. The connection that sent it gets only its `message_ack`. After a reconnect, a viewer can get the same message twice, so keep one per `message_id`, and drop a `user_message` with a `client_message_id` you sent.

## Resuming

- **The resume token:**
  - Every `conversation_initiation_metadata` carries a fresh `resume_token`. Keep only the newest.
  - It reconnects to the same conversation for 24 hours.
- **When to resume:** after close 1001, 1011, 1012, 1013 or 4012, a dropped network or a page reload. For a page reload, keep the newest resume token where the page finds it again, such as `sessionStorage`. Connect with `?token=<resume token>` and send `conversation_initiation_client_data` again.
- **What follows:**
  - The server answers `conversation_initiation_metadata` (with a new resume token), then `conversation_history`.
  - A message waiting for its ack that appears in the history, by its `client_message_id`, is saved: take its `message_id` from there, and don't send it again.
  - Send every other message that has no ack yet again, oldest first, each with its own `client_message_id`.
- **Pacing:** wait between attempts, longer each time and with some randomness, so a drained server's clients don't all return at once. Give up after about a minute.

## Limits

- Frames up to 64 KB.
- 10 new `user_message`s per 10 seconds on a connection. One over it gets `message_error` with `rate_limited`, which is retryable. Sending a message again with its `client_message_id` doesn't count.
- 50 frames per 10 seconds: every JSON frame, and every binary frame but a call's audio. Over it, the server closes with 4029.
- A call's audio at most twice as fast as real time, after a catch-up of up to 10 s, so a client whose network stalled can send what it held. Faster closes the connection with 4029.
  - The silence a gap in the numbers stands for counts as audio.
  - Every microphone frame counts as at least 20 ms: a smaller one, or one numbered at or below one already sent, costs as much as a full frame.
- A `ping` every 15 seconds. Two unanswered pings close the connection with 1001 `ping_timeout`. A client that has heard nothing for 40 seconds can take the connection as lost, and resume.

## Voice

- **Asking for a call:** send `text_only: false` in `conversation_initiation_client_data`, with `audio` (`input`: `pcm_16000`; `output`: `pcm_16000` or `pcm_24000`, `pcm_16000` when omitted). Leaving `text_only` out opens a text session.
  - The token must allow voice, or the server closes with 4003 `not_allowed`.
  - The server takes a voice line first (4009 `voice_limit` when none is free), then checks the balance (4010 `balance` when it can't cover one minute).
  - Each refusal comes before the metadata. The metadata then carries `features.voice: true` and the `audio` formats.
  - `audio.environment` says what to play under the agent, as the builder set it: `ambience_url`, relative to the socket's address, with its `volume`, and `phone_filter`, the agent's voice between 300 and 3,400 Hz. Mix them on your side, so the microphone's echo cancelling keeps them from the agent. A sound that won't load is no sound.
  - Send audio only once the metadata has arrived.
- **Audio frames** are binary:

  ```
  byte 0      kind: 0x01 user audio, 0x02 agent audio
  bytes 1–4   uint32, big-endian: the chunk's sequence (user) or the reply's event_id (agent)
  bytes 5…    PCM16 little-endian, mono, at the negotiated rate
  ```

  - Send the microphone in 20 ms frames (640 bytes of PCM), numbered from 0 on each connection and only upward.
    - A gap in the numbers counts as silence, up to 1 s of it. A number at or below one already sent is dropped.
    - After a stall, drop the audio you couldn't send rather than flood the socket, and keep numbering.
  - Agent audio arrives up to about 400 ms ahead of real time. Play it in order, at the metadata's `audio.output` rate.
  - **Playback reports** tell the server what the customer heard. Send `playback` with the reply's `played_ms` every 250 ms while the reply plays, once at `audio_pause`, once at `interruption`, and whenever the reply's audio runs out: at its end, or early after a stall.
  - **Frames the server can't use:** on a call, a binary frame that isn't user audio (shorter than its 5-byte header, a kind other than `0x01`, no PCM, or an odd number of PCM bytes) gets `error` with `invalid_event`. On a text session, every binary frame gets `error` with `unknown_event`. Either way the socket stays open, and the frame counts against the frame limit.
- **A turn:** `agent_state` moves through `listening`, `thinking` and `speaking`.
  - On a new conversation, the agent speaks its first message first: its `agent_response`, and `agent_state` `speaking` with its audio, in either order. Play the audio as it comes, whether or not the text has arrived.
  - The customer's turn ends after a pause in their speech, 700 ms unless the agent is set to answer sooner or later. The server sends `user_transcript`, then `agent_typing`, and the reply streams as text (`agent_chat_response_part`, `agent_response`) beside its audio.
  - `agent_state` goes back to `listening` once the reply has played.
  - **Fillers:** when a reply is slow, a short line may play first, as audio under an `event_id` of its own. It has no `agent_response`, nobody's transcript holds it, and no `agent_response_correction` comes for it. The reply follows under its own `event_id`.
- **Interruptions:**
  1. When the customer has spoken over a reply for 250 ms, `audio_pause` arrives: pause playback and keep the buffer.
  2. Then either `audio_resume` (nothing to answer was said, such as a cough: carry on where you paused), or `interruption` (1.5 s of speech, or a transcript with words: drop the reply's audio).
  3. After an interruption, `agent_response_correction` gives the part of the reply the customer heard, and nothing more comes for that reply.

  An agent can turn interruptions off. Words spoken over its reply then wait until the reply has played.
- **Who gets what:**
  - Only the call's connection gets the agent's audio, `agent_state`, `audio_pause`, `audio_resume` and `interruption`.
  - Every viewer of the conversation, the call's connection among them, gets `user_transcript`, `agent_typing`, each reply's text and its correction.
  - The two streams aren't ordered against each other. For example, `agent_state` `thinking` can come before or after the `user_transcript` that began the turn.
- **The call's lifecycle:**
  - **Hanging up** is closing the socket. A conversation that was only this call ends with it, and coming back opens the next one, which knows what was said. One that also had a chat goes on as chat.
  - **Max duration:** a call that reaches the agent's max duration is closed with 1000 `max_duration`, without `conversation_ended`. It ends or goes on as a hang-up does.
  - **Silence:** a call left silent for as long as the agent allows is closed with 1000 `silence`, without `conversation_ended`. It ends or goes on as a hang-up does.
  - **A goodbye:** the server closes when it reckons the last frame has played, and the network and your buffer are behind that. After a close from the server with 1000, let what you hold play out.
  - **One call per conversation:** a second connection that asks for a call takes it over, and the first is closed with 4008 `taken_over`. Text viewers are never replaced.
  - **Reconnecting:** after 4012, 1001 or 1011, or a dropped network, resume with `text_only: false` to go on with the call. Drop the reply that was playing, and number the microphone from 0 again.
- **Typing during a call:** a `user_message` from any viewer goes into the call, and the agent answers it by voice.

## Unknown events

A newer client may send an event an older server doesn't know. The server answers `error` with `unknown_event` and keeps the connection open, so clients can add events safely. Clients should likewise ignore server events they don't know.

## Client tools

A client tool runs in the customer's page: opening the cart, filling a form, reading what the page shows.

- The page names the client tools it runs in `client_tools`, in its handshake: at most 32, each named as on the agent, in snake_case. A name the server can't take fails the handshake with 1008.
- When the agent calls one, one connection that named it gets `client_tool_call`: the one the customer last wrote or called from, when it named the tool, or else another that did. A connection that didn't name the tool never gets the call, and the tool runs once however many connections are open.
- With `expects_response`:
  - the page answers `client_tool_result`, with the same `tool_call_id`;
  - the agent waits for that answer, up to the tool's timeout, and goes on without one after that.
- Without `expects_response`, the agent doesn't wait.
- An answer the agent isn't waiting for is dropped: a second or a late one, one to a call without `expects_response`, and one to a call the server never sent.
- A call to a tool no connected page named answers "not available" to the agent at once, and the agent goes on without it.
- The agent reads a result as data, never as instructions.

## Fixtures

Each file in [`fixtures/`](fixtures) records one connection: `{description, token, frames}`.
- `token` says whether the client connects with a session token or a resume token.
- Each entry in `frames` is a client or server frame, in the order they crossed the connection, the server's close, or an `audio` entry.
- An `audio` entry stands for a run of binary audio frames between two other entries:
  - from the client, `{kind: "user", sequence, ms: 20, count}`: microphone frames numbered `sequence` to `sequence + count - 1`;
  - from the server, `{kind: "agent", event_id, ms, count}`: that many frames of one reply's audio, each `ms` long.
  - `count` is 1 when it's left out.
- A client frame marked `invalid` must fail the schema; it shows what the server does with one.

`npm test` in `spec/` checks that every frame is an event of its side, and that every event appears in some fixture. For calls, it also checks that the microphone's numbers only go up, that agent audio belongs to a reply the fixture shows, that no `playback` claims more of a reply than its audio so far, and that every voice close code has a fixture.

The voice fixtures come from [`spec/scripts/voice-fixtures.py`](../scripts/voice-fixtures.py), which simulates the engine's playout and the client's report clock. Change it, not the fixtures, and run it again; `npm test` fails when they differ.
