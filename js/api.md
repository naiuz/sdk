# API reference

Every method of `@naiuz/sdk`, with its parameters and what it resolves to. Paths are relative to the base URL, `https://my.neuronai.uz/api/v1` by default. Every type named here is exported by the package.

Each method takes an options object last: `RequestOptions` (`timeout`, `maxRetries`, `extraHeaders`, `signal`), or `IdempotentRequestOptions`, which adds `idempotencyKey`, on the five calls that send an `Idempotency-Key`. Each returns an `APIPromise`: await it for the result, or call `withResponse()` for `{data, status, headers}`. `WithRequestId<T>` is `T` with a read-only `request_id`, and `WithCost<T>` is `T` with a read-only `cost` when the answer sends `X-Cost`.

## The client

### `new NeuronAI(options?: ClientOptions)`

| Option | Type | |
|---|---|---|
| `apiKey` | `string` | Your API key. Defaults to `NEURONAI_API_KEY`. |
| `baseURL` | `string` | Defaults to `NEURONAI_BASE_URL`, then to `https://my.neuronai.uz/api/v1`. |
| `timeout` | `number` | Milliseconds each attempt may take: `300000` by default. |
| `maxRetries` | `number` | Retries of a failed attempt: `2` by default. |
| `defaultHeaders` | `Record<string, string>` | Headers sent with every call. |
| `fetch` | `Fetch` | A fetch implementation. Defaults to the global `fetch`. |
| `dangerouslyAllowBrowser` | `boolean` | Allows construction in a browser page. `false` by default. |

## `client.tts`

### `tts.synthesize(params: SynthesizeSpeechRequest, options?: IdempotentRequestOptions): APIPromise<SpeechAudio>`

`POST /tts/synthesize`. Speech from text, as a WAV and its headers. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `text` | `string` | Required. The text to speak, measured as spoken length: an emotion tag counts as one character. |
| `voice_id` | `string \| null` | A stock voice or one of your clones, up to 128 characters. |
| `language` | `SpeechLanguage \| null` | The text's language, such as `uz`. |
| `quality` | `SpeechQuality \| null` | `fast`, `standard` or `high`. |
| `speed` | `number \| null` | From 0.5 to 2. |

### `tts.dialogue(params: SynthesizeDialogueRequest, options?: IdempotentRequestOptions): APIPromise<DialogueAudio>`

`POST /tts/dialogue`. A multi-speaker script rendered into one WAV, with where each turn sits. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `turns` | `DialogueTurn[]` | Required. 1 to 100 turns, each `{voice_id, text}` and optionally its own `language`, `quality` and `speed`. |
| `gap_ms` | `number \| null` | Milliseconds of silence between turns, from 0 to 5000. |
| `language` | `SpeechLanguage \| null` | The language of each turn that doesn't set its own. |
| `quality` | `SpeechQuality \| null` | The quality of each turn that doesn't set its own. |
| `speed` | `number \| null` | The speed of each turn that doesn't set its own. |

### `tts.jobs.create(params: SynthesizeSpeechRequest, options?: IdempotentRequestOptions): APIPromise<WithRequestId<TtsJob>>`

`POST /tts/jobs`. Queues a synthesis, with synthesize's parameters, and resolves with the job at once. Sends an `Idempotency-Key`.

### `tts.jobs.retrieve(id: string, options?: RequestOptions): APIPromise<WithRequestId<TtsJob>>`

`GET /tts/jobs/{id}`. The job and where it stands: `queued`, `running`, `succeeded` or `failed`.

### `tts.jobs.audio(id: string, options?: RequestOptions): APIPromise<SpeechAudio>`

`GET /tts/jobs/{id}/audio`. A succeeded job's WAV. 409 `job_not_finished` or `job_failed` before then; 410 `audio_expired`, as `GoneError`, 24 hours after the job finishes.

### `tts.jobs.createAndWait(params: SynthesizeSpeechRequest, options?: WaitOptions): Promise<WithRequestId<TtsJob>>`

Creates a job, polls it until it has `succeeded` or `failed`, and resolves with it. Rejects with `WaitTimeoutError`, carrying the job as last seen, when the wait runs out. A poll that fails with a connection error, a timeout, or a 429, 500, 502, 503 or 504 is retried at the next interval until the deadline; any other error rejects at once. Pass your own `idempotencyKey` to pick up the same job if the wait rejects, instead of queuing and billing a second one.

| Option | Type | |
|---|---|---|
| `pollInterval` | `number` | Milliseconds between polls: `2000` by default. |
| `timeout` | `number` | Milliseconds to wait, counted from when the job is created: `600000` by default. |
| `idempotencyKey`, `maxRetries`, `extraHeaders`, `signal` | | As for any call. Each request keeps the client's own timeout. |

## `client.voices`

### `voices.list(params?: ListVoicesParams, options?: RequestOptions): PagePromise<Voice>`

`GET /tts/voices`. Stock voices first, then your ready clones, newest first.

| Parameter | Type | |
|---|---|---|
| `type` | `VoiceType \| null` | `stock` or `custom`. |
| `language` | `string \| null` | Only voices in this language. |
| `limit` | `number \| null` | Voices per page, from 1 to 100 (50 by default). |
| `cursor` | `string \| null` | A page's `next_cursor`. |

### `voices.retrieve(id: string, options?: RequestOptions): APIPromise<WithRequestId<Voice>>`

`GET /tts/voices/{id}`. One voice.

### `voices.create(params: CreateVoiceRequest, options?: IdempotentRequestOptions): APIPromise<WithRequestId<Voice>>`

`POST /tts/voices`, as multipart/form-data. Clones a voice from a reference clip. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `name` | `string` | Required. Up to 120 characters. |
| `language` | `SpeechLanguage` | Required. The language the voice speaks. |
| `ref_audio` | `Uploadable` | Required. A 10–15 second clip: WAV, MP3, OGG or FLAC, at most 10 MB. |
| `ref_text` | `string \| null` | What the clip says, up to 1000 characters. |
| `category` | `VoiceCategory` | What the voice is for. |
| `tags` | `string[] \| null` | Up to 32 characters each, sent as repeated `tags[]` fields. |

### `voices.update(id: string, params: UpdateVoiceRequest, options?: RequestOptions): APIPromise<WithRequestId<Voice>>`

`PATCH /tts/voices/{id}`. Changes a clone's `name`, `category`, `language`, `ref_text` or `tags`; send only the fields to change. Changing the language or the transcript re-creates the voice, which can take minutes: pass a longer `timeout`.

### `voices.replaceAudio(id: string, params: ReplaceVoiceAudioRequest, options?: RequestOptions): APIPromise<WithRequestId<Voice>>`

`POST /tts/voices/{id}/audio`, as multipart/form-data. Replaces a clone's reference clip, which re-creates the voice: pass a longer `timeout`.

| Parameter | Type | |
|---|---|---|
| `ref_audio` | `Uploadable` | Required. The new clip, in the formats and size a new clone takes. |
| `ref_text` | `string \| null` | What the new clip says, up to 1000 characters. |

### `voices.delete(id: string, options?: RequestOptions): APIPromise<void>`

`DELETE /tts/voices/{id}`. Deletes a clone for good.

## `client.stt`

### `stt.transcribe(params: CreateTranscriptionRequest, options?: IdempotentRequestOptions): APIPromise<WithRequestId<Transcription>>`

`POST /stt/transcribe`, as multipart/form-data. The text, the language, the duration, timed segments, the price and your balance after the charge. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `file` | `Uploadable` | Required. MP3, WAV, OGG, FLAC, M4A or WebM, at most 25 MB. |
| `language` | `TranscriptionLanguage` | Required. The language spoken: `uz`, `ru`, `en`, `kk`, `tk`, `tg`, `tr`, `az`, `ja`, `de` or `ko`. |

## `client.chat.completions`

### `chat.completions.create(params: CreateChatCompletionRequest, options?: RequestOptions): APIPromise<WithCost<ChatCompletion>>`

### `chat.completions.create(params: CreateChatCompletionRequest & {stream: true}, options?: RequestOptions): APIPromise<Stream<ChatCompletionChunk>>`

`POST /chat/completions`. A model response, billed per token; with `stream: true`, a `Stream` of chunks as the answer is generated.

| Parameter | Type | |
|---|---|---|
| `model` | `string` | Required. A model's id, from `models.list()`. |
| `messages` | `ChatMessage[]` | Required. At least one `{role, content}`: `system`, `user`, `assistant` or `tool`, with the text as one string. |
| `max_tokens` | `number \| null` | The most tokens to generate, 1 or more. |
| `temperature` | `number \| null` | From 0 to 2. |
| `top_p` | `number \| null` | From 0 to 1. |
| `stop` | `string \| string[] \| null` | Text at which the model stops. |
| `stream` | `boolean \| null` | `true` streams the answer. |

## `client.models`

### `models.list(options?: RequestOptions): APIPromise<WithCost<ModelList>>`

`GET /models`. The chat models available to your account.

## `client.embeddings`

### `embeddings.create(params: CreateEmbeddingRequest, options?: RequestOptions): APIPromise<WithCost<EmbeddingResponse>>`

`POST /embeddings`. A float vector per input, billed per input token.

| Parameter | Type | |
|---|---|---|
| `model` | `string` | Required. The embedding model's id. |
| `input` | `string \| string[]` | Required. One text, or a list for a batch. |
| `encoding_format` | `"float" \| null` | Only float vectors are served. |

## `client.rerank`

### `rerank.create(params: RerankRequest, options?: RequestOptions): APIPromise<WithCost<RerankResponse>>`

`POST /rerank`. The documents ranked by relevance to the query, highest first.

| Parameter | Type | |
|---|---|---|
| `model` | `string` | Required. The rerank model's id. |
| `query` | `string` | Required. |
| `documents` | `string[]` | Required. At least one. |
| `top_n` | `number \| null` | How many of the best documents to return. |
| `return_documents` | `boolean \| null` | `false` leaves out each result's `document`. |

## `client.account`

### `account.balance(options?: RequestOptions): APIPromise<WithRequestId<Balance>>`

`GET /balance`. Your organization's remaining credit, and its prices.

### `account.usage(params?: UsageParams, options?: RequestOptions): APIPromise<WithRequestId<Usage>>`

`GET /usage`. Spend and request counts over the last `days` (`7`, `30` or `90`; 30 by default), by service and by API key.

## `client.apiKeys`

### `apiKeys.list(params?: ListApiKeysParams, options?: RequestOptions): PagePromise<ApiKey>`

`GET /api-keys`. Your organization's keys, newest first, revoked ones included. Takes `limit` (1 to 100) and `cursor`.

### `apiKeys.create(params: CreateApiKeyRequest, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>>`

`POST /api-keys`. Creates a key and resolves with it and its `secret`, the only time the secret is shown. Only a 429 or a connection that was never made is retried.

| Parameter | Type | |
|---|---|---|
| `name` | `string` | Required. 1 to 80 characters. |
| `access` | `ApiKeyAccess` | Required. `full` or `restricted`. |
| `description` | `string \| null` | Up to 500 characters. |
| `permissions` | `Partial<ApiKeyPermissions>` | Levels by product, such as `{tts: "write"}`. |
| `expires_at` | `string \| null` | When the key stops working (ISO 8601). |
| `monthly_spend_limit` | `number \| null` | UZS per calendar month. |
| `allowed_ips` | `string[] \| null` | Up to 100 addresses or CIDR ranges. |

### `apiKeys.retrieve(id: string, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>>`

`GET /api-keys/{id}`. One key.

### `apiKeys.update(id: string, params: UpdateApiKeyRequest, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>>`

`PATCH /api-keys/{id}`. Changes a key: `name`, `description`, `access`, `permissions` (the whole map), `expires_at`, `monthly_spend_limit`, `enabled` or `allowed_ips`. Send only the fields to change.

### `apiKeys.revoke(id: string, options?: RequestOptions): APIPromise<void>`

`POST /api-keys/{id}/revoke`. Revokes a key for good.

## Results and helpers

- `SpeechAudio`: `audio` (`Uint8Array`), `content_type`, `cost`, `character_count`, `balance`, `voice_custom`, `latency_ms`, `replayed`, `request_id`, and `save(path): Promise<void>`. `DialogueAudio` adds `turns` (`DialogueTurnTiming[]`) and `turn_count`.
- `Page<T>`: `data`, `next_cursor`, `request_id`, `hasNextPage()`, `nextPage(): PagePromise<T>`, and `for await` over every item. `PagePromise<T>` is the `APIPromise` of a page, and loops the same way.
- `Stream<T>`: `for await` over the chunks, `close()`, and `toReadableStream(): ReadableStream<Uint8Array>`.
- `Uploadable`: a `File`, or `FileUpload`: `{data: Uint8Array | Blob, filename: string, contentType?: string}`.
- Errors: `NeuronAIError`, `APIConnectionError`, `APITimeoutError`, `APIError` and its status classes, `WaitTimeoutError`, and the `ErrorCode` enum.
