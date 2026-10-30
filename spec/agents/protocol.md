# The agents protocol, version 0.1

A client talks to a NeuronAI agent over one WebSocket. This document is the prose spec. The events themselves are defined in [`events.schema.json`](events.schema.json), which is the source of truth. [`fixtures/`](fixtures) holds recorded sessions that the SDKs and the engine both replay.

Version 0.1 covers text conversations. Voice arrives in a later 0.x version, which adds events and fields without changing the ones here.

## Connecting

- **The URL:** `wss://my.neuronai.uz/api/v1/realtime?token=…`.
- **The token** is either:
  - a session token: a short-lived JWS your backend, or the dashboard, gets from NeuronAI;
  - a resume token: one the server gave this conversation earlier (see [Resuming](#resuming)).
- **Frames:** every event is a JSON text frame with a `type` field. Version 0.1 has no binary frames.
- **The handshake:**
  1. The client sends `conversation_initiation_client_data` as its first frame, within 10 seconds.
  2. The server answers `conversation_initiation_metadata`.
  3. The conversation can then start. On a new conversation, the agent's first message arrives as an `agent_response`. On a resume, `conversation_history` arrives first.

The server accepts every connection and then closes it with a [close code](#close-codes) when it refuses it, because a browser can't read the HTTP status of a refused upgrade.

## Client events

| Event | Fields |
|---|---|
| `conversation_initiation_client_data` | All optional: `dynamic_variables` (values for the agent's variables; signed values in the token win), `overrides` (`first_message`, `language`; only those the token allows), `text_only`, `user_id` |
| `user_message` | `client_message_id`: your own id for the message, `^[A-Za-z0-9_-]{1,64}$`, the same on every retry; `text`: 1 to 10,000 characters |
| `pong` | `event_id`: the id of the `ping` it answers |

## Server events

| Event | Fields |
|---|---|
| `conversation_initiation_metadata` | `conversation_id`, `resume_token`, `status` (the conversation's status, such as `ai_handling` or `human_handling`), `languages`, `language`, `features` (`text`, `voice`, `debug`) |
| `conversation_history` | On a resume: `messages`, each `{role, text, at}`, oldest first. It includes replies that arrived while the client was away |
| `message_ack` | `client_message_id`, `message_id`, `occurred_at`: the message is saved |
| `message_error` | `client_message_id`, `retryable`, `code` (`refused`, `unavailable` or `invalid`): the message wasn't saved |
| `user_message` | `client_message_id`, `message_id`, `text`, `occurred_at`: a message another viewer of the conversation sent |
| `agent_typing` | Shown before a text reply |
| `agent_chat_response_part` | `event_id`, `text_response_part` (`type`: `start`, `delta` or `stop`; `text`): one piece of a streamed reply |
| `agent_response` | `event_id`, `text`: the final text of a reply |
| `agent_response_correction` | `event_id`, `text`: replaces what you have of that reply. An empty text withdraws it |
| `operator_message` | `event_id`, `text`, `operator` (`name`, `avatar_url`): an operator's reply |
| `handoff` | `reason` (`agent`, `agent_failed` or `balance`), `mode_outcome` (`continue_as_text`): operators have the conversation now, and the agent stays silent |
| `turn_debug` | Only when the token allows debugging: how a turn ran, with its `event_id`, `turn_id`, `step`, `model`, `fallback_used`, `timings`, `usage` and `warnings` |
| `ping` | `event_id`: answer with a `pong` carrying the same id |
| `conversation_ended` | `reason`. The server then closes with 1000 |
| `error` | `code` (`unknown_event`, `invalid_event` or `internal`), `message`: a frame the server couldn't use. The socket stays open |

`event_id`s count up per conversation, across its turns. A reply's parts, its final `agent_response` and any correction share one `event_id`.

## Close codes

| Code | Meaning | What the client does |
|---|---|---|
| 1000 | Ended normally. The reason `ping_timeout` means two pings went unanswered | Stop |
| 1008 | A protocol error: no handshake within 10 seconds, or a first frame that isn't one | Stop, and fix the client |
| 1009 | A frame over 64 KB | Stop, and fix the client |
| 1011 | An internal error | Reconnect with the resume token, after a pause |
| 4001 | The token is invalid or expired | Stop. A session token must be fetched again; an expired resume token ends the conversation on this client |
| 4003 | Not allowed: the agent is paused or gone, or an override the token doesn't allow | Stop |
| 4012 | The server is draining | Reconnect with the resume token |
| 4029 | Too many messages | Stop |

Codes 4008, 4009 and 4010 belong to voice, in a later version.

## Sending messages

- **Saved means acked.** `message_ack` arrives once the message is stored. Until then, keep the message and its `client_message_id`.
- **Retrying:**
  - After a `message_error` with `retryable: true`, send the same message again with the same `client_message_id`, after a pause that grows each time.
  - After `retryable: false`, don't. The message stays unsent.
  - The server stores a message once per `client_message_id`, so a retry never makes a duplicate. A repeat is acked with the same `message_id`.
- **Order:** the server stores one connection's messages in the order they arrive.
- **Other viewers:** every other connection on the conversation gets the message as a server `user_message`. The connection that sent it gets only its `message_ack`.

## Resuming

- **The resume token:**
  - Every `conversation_initiation_metadata` carries a fresh `resume_token`. Keep only the newest.
  - It reconnects to the same conversation for 24 hours.
- **When to resume:** after close 4012 or 1011, a dropped network or a page reload. Connect with `?token=<resume token>` and send `conversation_initiation_client_data` again.
- **What follows:**
  - The server answers `conversation_initiation_metadata` (with a new resume token), then `conversation_history`.
  - Send every message that has no ack yet again, oldest first, each with its own `client_message_id`.
- **Pacing:** wait between attempts, longer each time, and give up after a few.

## Limits

- Frames up to 64 KB.
- 10 `user_message`s per 10 seconds, and 50 frames of any kind per 10 seconds. Over either, the server closes with 4029.
- A `ping` every 15 seconds. Two unanswered pings close the connection with 1000 `ping_timeout`.

## Unknown events

A newer client may send an event an older server doesn't know. The server answers `error` with `unknown_event` and keeps the connection open, so clients can add events safely. Clients should likewise ignore server events they don't know.

## Fixtures

Each file in [`fixtures/`](fixtures) records one connection: `{description, token, frames}`.
- `token` says whether the client connects with a session token or a resume token.
- Each entry in `frames` is a client or server frame, in the order they crossed the connection, or the server's close.
- A client frame marked `invalid` must fail the schema; it shows what the server does with one.

`npm test` in `spec/` checks that every frame is an event of its side, and that every event appears in some fixture.
