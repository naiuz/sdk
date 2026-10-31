# The agents protocol, version 0.1

A client talks to a NeuronAI agent over one WebSocket. This document is the prose spec. The events themselves are defined in [`events.schema.json`](events.schema.json), which is the source of truth. [`fixtures/`](fixtures) holds recorded sessions that the SDKs and the engine both replay.

Version 0.1 covers text conversations and basic voice calls (see [Voice](#voice)). Later 0.x versions add events and fields without changing the ones here.

## Connecting

- **The URL:** `wss://my.neuronai.uz/api/v1/realtime?token=…`.
- **The token** is either:
  - a session token: a short-lived JWS your backend, or the dashboard, gets from NeuronAI;
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
| `conversation_initiation_client_data` | All optional: `dynamic_variables` (values for the agent's variables; signed values in the token win), `overrides` (`first_message`, `language`; only those the token allows), `text_only` (`false` asks for a call; left out, the session is text), `audio` (a call's formats: `input` `pcm_16000`, `output` `pcm_16000` or `pcm_24000`), `user_id` |
| `user_message` | `client_message_id`: your own id for the message, `^[A-Za-z0-9_-]{1,64}$`, the same on every retry; `text`: 1 to 10,000 characters |
| `playback` | `event_id`, `played_ms`: milliseconds of that reply's audio played since its first frame, pauses excluded. Sent every 250 ms while it plays, once when it pauses (on `audio_pause` or `interruption`), and whenever its audio runs out, at its end or early after a stall, so the server knows what was heard |
| `pong` | `event_id`: the id of the `ping` it answers |

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
| `operator_message` | `event_id`, `text`, `operator` (`name`, `avatar_url`): an operator's reply |
| `handoff` | `reason` (`agent`, `agent_failed` or `balance`), `mode_outcome` (`continue_as_text`): operators have the conversation now, and the agent stays silent |
| `turn_debug` | Only when the token allows debugging: how a turn ran, with its `event_id`, `turn_id`, `step`, `model`, `fallback_used`, `timings`, `usage`, `warnings` and `error_code`: null when the turn went through, otherwise why it failed (`model_timeout`, `model_unavailable`, `model_error`, `egress_blocked`, `config_invalid`, `config_unavailable`, `secret_missing`, `turn_expired` or `internal`; take a code you don't know as `internal`) |
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
| 1000 | Ended normally: the conversation ended, after `conversation_ended`; the client ended the session; or a call reached the agent's max duration (reason `max_duration`), and the conversation goes on as chat | Stop. After `max_duration`, resume with `text_only: true` to go on chatting |
| 1001 | The server stopped hearing from the client: two pings went unanswered (reason `ping_timeout`), as when a phone suspends the page | Reconnect with the resume token |
| 1008 | A protocol error: no handshake within 10 seconds, or a first frame that isn't one | Stop, and fix the client |
| 1009 | A frame over 64 KB | Stop, and fix the client |
| 1011 | An internal error | Reconnect with the resume token, after a pause |
| 1012, 1013 | The web server restarted, or is overloaded. The gateway itself doesn't send these | Reconnect with the resume token, after a pause |
| 4001 | The token is invalid or expired | Stop. A session token must be fetched again; an expired resume token ends the conversation on this client |
| 4003 | Not allowed: the agent is paused or gone, an override the token doesn't allow, or a call the token doesn't allow | Stop |
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
  - **Hanging up** is closing the socket. The conversation goes on as chat.
  - **Max duration:** a call that reaches the agent's max duration is closed with 1000 `max_duration`, without `conversation_ended`. The conversation goes on as chat.
  - **One call per conversation:** a second connection that asks for a call takes it over, and the first is closed with 4008 `taken_over`. Text viewers are never replaced.
  - **Reconnecting:** after 4012, 1001 or 1011, or a dropped network, resume with `text_only: false` to go on with the call. Drop the reply that was playing, and number the microphone from 0 again.
- **Typing during a call:** a `user_message` from any viewer goes into the call, and the agent answers it by voice.

## Unknown events

A newer client may send an event an older server doesn't know. The server answers `error` with `unknown_event` and keeps the connection open, so clients can add events safely. Clients should likewise ignore server events they don't know.

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
