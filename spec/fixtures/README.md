# Contract fixtures

Each file under `fixtures/<operationId>/` is one contract fixture. It holds:
- one SDK call;
- the exact HTTP request that call must send;
- a canned response;
- the result the SDK must return from it.

Every SDK replays every fixture, as [Replaying a fixture](#replaying-a-fixture) describes.

`npm run validate` checks every fixture against `spec/openapi.json`.

## Format

The schema is `fixture.schema.json`.

- **`call`:** what the caller passes.
  - `path_params`: path parameters.
  - `params`: the request's fields or query parameters, under the API's own snake_case names. A query parameter the caller leaves out is not sent, and fixtures never pass `null` for one.
  - `files`: uploads, each `{filename, content_type, base64}`.
  - `options.idempotency_key`: for the five idempotent operations.
- **`request`:** what must go over the wire.
  - `method`.
  - `path`, relative to the base URL `…/api/v1`, with path parameters percent-encoded: every character outside RFC 3986's unreserved set (`A–Z a–z 0–9 - . _ ~`) becomes UTF-8 `%XX`.
  - `query`: values as strings.
  - `headers`: lower-case names. The SDK must send at least these, with these values. For a multipart body, `content-type` must start with the value given.
  - `body`: `null`, `{json}`, or `{multipart: {fields, files}}`. Array fields such as `tags` are sent as repeated `tags[]` parts.
- **`response`:** `status`, `headers` (lower-case) and `body`. The body is `null`, `{json}`, `{base64}` for audio, or `{sse: [...]}`, where each entry is one event's `data:` payload and the last is `[DONE]`.
- **`result`:** what the SDK returns, written the same way for every language.

## `result` conventions

| Response | `result` |
|---|---|
| `{data, request_id}` holding one object | `{"data": …, "request_id": …}` |
| `{data: [...], next_cursor, request_id}`, a page | `{"data": [...], "next_cursor": …, "request_id": …}` |
| Chat completion, models, embeddings or rerank (their own bodies) | `{"body": …}`, plus `"cost": <number>` when the response has `x-cost` |
| Audio (synthesize, dialogue, a job's audio) | `{"audio_base64", "content_type", "cost", "character_count", "balance", "voice_custom", "latency_ms", "replayed", "request_id"}`. A dialogue adds `"turns"` (parsed from `x-turns`) and `"turn_count"`. |
| 204 | `null` |
| An error | `{"error": {"class", "status", "type", "code", "message", "param", "fields", "request_id", "retry_after"}}`. `class` is the Python and TypeScript error class; PHP uses the same name ending in `Exception`. `fields` is `null` when absent. `retry_after` is the `retry-after` header's seconds, as a number, on a 429 that sends one, and `null` otherwise. |
| A stream | `{"chunks": [...]}`: each event before `[DONE]`, parsed |

How audio headers become fields:
- `x-cost`, `x-balance` and `x-latency-ms` become numbers.
- `x-character-count` and `x-turn-count` become integers.
- `x-voice-custom` becomes `true` only for `"1"`.
- `idempotency-replayed` becomes `true` only for `"1"`, and is `false` when absent.

## Replaying a fixture

- Build the client with the API key `nai_test_fixture_key`, the default base URL and `max_retries: 0`, so a 429 or 5xx fixture raises at once instead of retrying.
- Answer the one request the call sends with `response`, after checking that request against `request`.
- Compare what the SDK returns with `result` as JSON values:
  - key order doesn't matter;
  - numbers compare by value, so `1650` equals `1650.0`;
  - a key that is absent on one side matches `null` on the other.
