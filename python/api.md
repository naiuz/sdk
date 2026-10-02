# API reference

Every method of `naiuz`, with its parameters and what it returns. Paths are relative to the base URL, `https://my.neuronai.uz/api/v1` by default. The clients, errors, pages and streams are in `naiuz`; every other type named here is in `naiuz.types`.

`NeuronAI` and `AsyncNeuronAI` have the same resources and methods. On `AsyncNeuronAI` each method is a coroutine to await, except a list method, which returns an `AsyncPaginator`: await it for the first page, or loop over it with `async for` for every item. Every parameter is keyword-only, except a path's `id`.

Every method also takes these options:

| Option | Type | |
|---|---|---|
| `timeout` | `float \| None` | Seconds each attempt of this call may take, reading the answer included. None keeps the client's. |
| `max_retries` | `int \| None` | Retries of this call's failed attempts. None keeps the client's. |
| `extra_headers` | `Mapping[str, str] \| None` | Headers for this call, over the client's. |
| `idempotency_key` | `str \| None` | The five idempotent calls only: the `Idempotency-Key` to send, at most 191 characters. None or `""` sends a generated one. |

An optional field of a request body defaults to `NOT_GIVEN`, which leaves it out; `None` sends JSON null where the API takes one. Each resource's `with_raw_response` has the same methods, each returning a `RawResponse`: `data` (the result), `status` and `headers`.

## The client

### `NeuronAI(*, api_key=None, base_url=None, timeout=None, max_retries=None, default_headers=None, http_client=None)`

| Option | Type | |
|---|---|---|
| `api_key` | `str \| None` | Your API key. Defaults to `NEURONAI_API_KEY`. |
| `base_url` | `str \| None` | Defaults to `NEURONAI_BASE_URL`, then to `https://my.neuronai.uz/api/v1`. |
| `timeout` | `float \| None` | Seconds each attempt may take: `300` by default. |
| `max_retries` | `int \| None` | Retries of a failed attempt: `2` by default. |
| `default_headers` | `Mapping[str, str] \| None` | Headers sent with every call. |
| `http_client` | `httpx.Client \| None` | The httpx client to send with: an `httpx.AsyncClient` for `AsyncNeuronAI`. It stays yours to close. |

`close()`, or leaving a `with` block (`async with` for `AsyncNeuronAI`), closes the httpx client the SDK made.

## `client.tts`

### `tts.synthesize(*, text, voice_id=, language=, quality=, speed=, idempotency_key=None) -> SpeechAudio`

`POST /tts/synthesize`. Speech from text, as a WAV and its headers. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `text` | `str` | Required. The text to speak, measured as spoken length: an emotion tag counts as one character. |
| `voice_id` | `str \| None` | A stock voice or one of your clones, up to 128 characters. |
| `language` | `SpeechLanguage \| None` | The text's language, such as `uz`. |
| `quality` | `SpeechQuality \| None` | `fast`, `standard` or `high`. |
| `speed` | `float \| None` | From 0.5 to 2. |

### `tts.dialogue(*, turns, gap_ms=, language=, quality=, speed=, idempotency_key=None) -> DialogueAudio`

`POST /tts/dialogue`. A multi-speaker script rendered into one WAV, with where each turn sits. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `turns` | `Sequence[DialogueTurn]` | Required. 1 to 100 turns, each `{"voice_id", "text"}`, and optionally its own `language`, `quality` and `speed`. |
| `gap_ms` | `int \| None` | Milliseconds of silence between turns, from 0 to 5000. |
| `language` | `SpeechLanguage \| None` | The language of each turn that doesn't set its own. |
| `quality` | `SpeechQuality \| None` | The quality of each turn that doesn't set its own. |
| `speed` | `float \| None` | The speed of each turn that doesn't set its own. |

### `tts.jobs.create(*, text, voice_id=, language=, quality=, speed=, idempotency_key=None) -> TtsJob`

`POST /tts/jobs`. Queues a synthesis, with synthesize's parameters, and returns the job at once. Sends an `Idempotency-Key`.

### `tts.jobs.retrieve(id) -> TtsJob`

`GET /tts/jobs/{id}`. The job and where it stands: `queued`, `running`, `succeeded` or `failed`.

### `tts.jobs.audio(id) -> SpeechAudio`

`GET /tts/jobs/{id}/audio`. A succeeded job's WAV. `ConflictError` (409 `job_not_finished` or `job_failed`) before then; `GoneError` (410 `audio_expired`) 24 hours after the job finishes.

### `tts.jobs.create_and_wait(*, text, voice_id=, language=, quality=, speed=, poll_interval=2.0, timeout=600.0, idempotency_key=None, max_retries=None, extra_headers=None) -> TtsJob`

Creates a job, polls it until it has `succeeded` or `failed`, and returns it. Raises `WaitTimeoutError`, carrying the job as last seen, when the wait runs out. A poll that fails with a connection error, a timeout, or a 429, 500, 502, 503 or 504 is tried again at the next interval until the deadline; any other error raises at once. Pass your own `idempotency_key` to pick up the same job if the wait raises, instead of queuing and billing a second one. It has no `with_raw_response` twin, since it sends several requests.

| Option | Type | |
|---|---|---|
| `poll_interval` | `float` | Seconds between polls: `2.0` by default. |
| `timeout` | `float` | Seconds to wait, counted from when the job is created: `600.0` by default. Each request keeps the client's own timeout, cut to the time left. |
| `max_retries` | `int \| None` | Retries of the create. Each poll is one attempt. |

## `client.voices`

### `voices.list(*, type=None, language=None, limit=None, cursor=None) -> Page[Voice]`

`GET /tts/voices`. Stock voices first, then your ready clones, newest first. `AsyncPaginator[Voice]` on `AsyncNeuronAI`.

| Parameter | Type | |
|---|---|---|
| `type` | `VoiceType \| None` | `stock` or `custom`. |
| `language` | `str \| None` | Only voices in this language. |
| `limit` | `int \| None` | Voices per page, from 1 to 100 (50 by default). |
| `cursor` | `str \| None` | A page's `next_cursor`. |

### `voices.retrieve(id) -> Voice`

`GET /tts/voices/{id}`. One voice.

### `voices.create(*, name, language, ref_audio, ref_text=, category=, tags=, idempotency_key=None) -> Voice`

`POST /tts/voices`, as multipart/form-data. Clones a voice from a reference clip. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `name` | `str` | Required. Up to 120 characters. |
| `language` | `SpeechLanguage` | Required. The language the voice speaks. |
| `ref_audio` | `Uploadable` | Required. A 10–15 second clip: WAV, MP3, OGG or FLAC, at most 10 MB. |
| `ref_text` | `str \| None` | What the clip says, up to 1000 characters. |
| `category` | `VoiceCategory` | What the voice is for. |
| `tags` | `Sequence[str] \| None` | Up to 32 characters each, sent as repeated `tags[]` fields. |

### `voices.update(id, *, name=, category=, language=, ref_text=, tags=) -> Voice`

`PATCH /tts/voices/{id}`. Changes a clone's `name`, `category`, `language`, `ref_text` or `tags`; only the fields you pass are sent. Changing the language or the transcript re-creates the voice, which can take minutes: pass a longer `timeout`.

### `voices.replace_audio(id, *, ref_audio, ref_text=) -> Voice`

`POST /tts/voices/{id}/audio`, as multipart/form-data. Replaces a clone's reference clip, which re-creates the voice: pass a longer `timeout`.

| Parameter | Type | |
|---|---|---|
| `ref_audio` | `Uploadable` | Required. The new clip, in the formats and size a new clone takes. |
| `ref_text` | `str \| None` | What the new clip says, up to 1000 characters. |

### `voices.delete(id) -> None`

`DELETE /tts/voices/{id}`. Deletes a clone for good.

## `client.stt`

### `stt.transcribe(*, file, language, idempotency_key=None) -> Transcription`

`POST /stt/transcribe`, as multipart/form-data. The text, the language, the duration, timed segments, the price and your balance after the charge. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `file` | `Uploadable` | Required. MP3, WAV, OGG, FLAC, M4A or WebM, at most 25 MB. |
| `language` | `TranscriptionLanguage` | Required. The language spoken: `uz`, `ru`, `en`, `kk`, `tk`, `tg`, `tr`, `az`, `ja`, `de` or `ko`. |

## `client.chat.completions`

### `chat.completions.create(*, model, messages, max_tokens=, temperature=, top_p=, stop=, stream=) -> ChatCompletion`

### `chat.completions.create(*, model, messages, ..., stream: Literal[True]) -> Stream[ChatCompletionChunk]`

### `chat.completions.create(*, model, messages, ..., stream: bool) -> ChatCompletion | Stream[ChatCompletionChunk]`

`POST /chat/completions`. A model response, billed per token; with `stream=True`, a `Stream` of chunks as the answer is generated (`AsyncStream` on `AsyncNeuronAI`). Without `stream`, or with `False` or None, the first overload applies; with `True`, the second; with a `bool` known only at run time, the third, returning the union. Unpacking a `CreateChatCompletionRequest` with `**` takes the third too, since its `stream` may be either.

| Parameter | Type | |
|---|---|---|
| `model` | `str` | Required. A model's id, from `models.list()`. |
| `messages` | `Sequence[ChatMessageParam]` | Required. At least one `{"role", "content"}`: `system`, `user`, `assistant` or `tool`, with the text as one string. |
| `max_tokens` | `int \| None` | The most tokens to generate, 1 or more. |
| `temperature` | `float \| None` | From 0 to 2. |
| `top_p` | `float \| None` | From 0 to 1. |
| `stop` | `str \| Sequence[str] \| None` | Text at which the model stops. |
| `stream` | `bool \| None` | `True` streams the answer. |

## `client.models`

### `models.list() -> ModelList`

`GET /models`. The chat models available to your account.

## `client.embeddings`

### `embeddings.create(*, model, input, encoding_format=) -> EmbeddingResponse`

`POST /embeddings`. A float vector per input, billed per input token.

| Parameter | Type | |
|---|---|---|
| `model` | `str` | Required. The embedding model's id. |
| `input` | `str \| Sequence[str]` | Required. One text, or a list for a batch. |
| `encoding_format` | `Literal["float"] \| None` | Only float vectors are served. |

## `client.rerank`

### `rerank.create(*, model, query, documents, top_n=, return_documents=) -> RerankResponse`

`POST /rerank`. The documents ranked by relevance to the query, highest first.

| Parameter | Type | |
|---|---|---|
| `model` | `str` | Required. The rerank model's id. |
| `query` | `str` | Required. |
| `documents` | `Sequence[str]` | Required. At least one. |
| `top_n` | `int \| None` | How many of the best documents to return. |
| `return_documents` | `bool \| None` | `False` leaves out each result's `document`. |

## `client.account`

### `account.balance() -> Balance`

`GET /balance`. Your organization's remaining credit, and its prices.

### `account.usage(*, days=None) -> Usage`

`GET /usage`. Spend and request counts over the last `days` (`7`, `30` or `90`; 30 by default), by service and by API key.

## `client.api_keys`

### `api_keys.list(*, limit=None, cursor=None) -> Page[ApiKey]`

`GET /api-keys`. Your organization's keys, newest first, revoked ones included: `limit` from 1 to 100 (50 by default), and a page's `next_cursor` as `cursor`. `AsyncPaginator[ApiKey]` on `AsyncNeuronAI`.

### `api_keys.create(*, name, access, description=, permissions=, expires_at=, monthly_spend_limit=, allowed_ips=) -> ApiKey`

`POST /api-keys`. Creates a key and returns it with its `secret`, the only time the secret is shown. Only a 429, or a connection that was never made, is retried.

| Parameter | Type | |
|---|---|---|
| `name` | `str` | Required. 1 to 80 characters. |
| `access` | `ApiKeyAccess` | Required. `full` or `restricted`. |
| `description` | `str \| None` | Up to 500 characters. |
| `permissions` | `ApiKeyPermissionsParam` | Levels by product, such as `{"tts": "write"}`. |
| `expires_at` | `str \| None` | When the key stops working (ISO 8601). |
| `monthly_spend_limit` | `float \| None` | UZS per calendar month. |
| `allowed_ips` | `Sequence[str] \| None` | Up to 100 addresses or CIDR ranges. |

### `api_keys.retrieve(id) -> ApiKey`

`GET /api-keys/{id}`. One key.

### `api_keys.update(id, *, name=, description=, access=, permissions=, expires_at=, monthly_spend_limit=, enabled=, allowed_ips=) -> ApiKey`

`PATCH /api-keys/{id}`. Changes a key: `name`, `description`, `access`, `permissions` (the whole map), `expires_at`, `monthly_spend_limit`, `enabled` or `allowed_ips`. Only the fields you pass are sent, and None sends null, which clears that field.

### `api_keys.revoke(id) -> None`

`POST /api-keys/{id}/revoke`. Revokes a key for good.

## Results and helpers

- `SpeechAudio`: `audio` (`bytes`), `content_type`, `cost`, `character_count`, `balance`, `voice_custom`, `latency_ms`, `replayed`, `request_id`, and `save(path)`. `DialogueAudio` adds `turns` (`list[DialogueTurnTiming]`) and `turn_count`.
- A result from an envelope, such as `Voice` or `TtsJob`, has a read-only `request_id`; one from a compatible endpoint, such as `ChatCompletion`, a read-only `cost`. Neither is a field, so `model_dump()` leaves them out.
- `Page[T]` (`AsyncPage[T]`): `data`, `next_cursor`, `request_id`, `has_next_page()`, `next_page()`, and a loop over every item.
- `Stream[T]` (`AsyncStream[T]`): a loop over the chunks, `close()`, and a `with` block (`async with`) that closes it.
- `Uploadable`: a path (`str` or `Path`), a `(filename, content)` or `(filename, content, content_type)` tuple whose content is `bytes` or a binary file object, or a binary file object with a name.
- `RawResponse[T]`: `data`, `status` and `headers` (`httpx.Headers`).
- Errors: `NeuronAIError`, `APIConnectionError`, `APITimeoutError`, `APIError` and its status classes, `WaitTimeoutError`, and the `ErrorCode` enum.
