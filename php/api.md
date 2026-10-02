# API reference

Every method of `naiuz/sdk`, with its parameters and what it returns. Paths are relative to the base URL, `https://my.neuronai.uz/api/v1` by default. The client, pages, streams and raw responses are in `Naiuz\`, the exceptions in `Naiuz\Exceptions\`, and every result and enum named here in `Naiuz\Types\`. Each request type named here is a PHPStan array shape that the resource defining it exports, for `@phpstan-import-type`.

A method takes its fields or its query as an array keyed by the API's own names, then an array of options for the call:

| Option | Type | |
|---|---|---|
| `timeout` | `float\|int` | Seconds each attempt of this call may take, reading the answer included. Leave it out to keep the client's. |
| `max_retries` | `int` | Retries of this call's failed attempts. Leave it out to keep the client's. |
| `extra_headers` | `array<string, string>` | Headers for this call, over the client's. |
| `idempotency_key` | `string\|null` | The five idempotent calls only: the `Idempotency-Key` to send, at most 191 characters. Null or `''` sends a generated one. |

A key a method doesn't take, in its fields, its query or its options, throws `NeuronAIException` before anything is sent. A field left out isn't sent, and a null is sent as JSON null where the API takes one, which clears the field. `$client->withRawResponse()` has the same resources and methods, each returning a `RawResponse`: `data` (the result), `status` and `headers`.

## The client

### `new NeuronAI(array $options = [])`

| Option | Type | |
|---|---|---|
| `api_key` | `string\|null` | Your API key. Defaults to `NEURONAI_API_KEY`. |
| `base_url` | `string\|null` | Defaults to `NEURONAI_BASE_URL`, then to `https://my.neuronai.uz/api/v1`. |
| `timeout` | `float\|int\|null` | Seconds each attempt may take: `300` by default. |
| `max_retries` | `int\|null` | Retries of a failed attempt: `2` by default. |
| `default_headers` | `array<string, string>\|null` | Headers sent with every call. |
| `http_client` | `Psr\Http\Client\ClientInterface\|null` | The PSR-18 client to send with. Without one, the SDK makes Guzzle when it is installed, else Symfony HttpClient, else uses what php-http/discovery finds. |

## `$client->tts`

### `tts->synthesize(array $params, array $options = []): SpeechAudio`

`POST /tts/synthesize`. Speech from text, as a WAV and its headers. Sends an `Idempotency-Key`. Its fields are `SynthesizeSpeechRequest`.

| Key | Type | |
|---|---|---|
| `text` | `string` | Required. The text to speak, measured as spoken length: an emotion tag counts as one character. |
| `voice_id` | `string\|null` | A stock voice or one of your clones, up to 128 characters. |
| `language` | `SpeechLanguage\|null` | The text's language, such as `uz`. |
| `quality` | `SpeechQuality\|null` | `fast`, `standard` or `high`. |
| `speed` | `float\|int\|null` | From 0.5 to 2. |

### `tts->dialogue(array $params, array $options = []): DialogueAudio`

`POST /tts/dialogue`. A multi-speaker script rendered into one WAV, with where each turn sits. Sends an `Idempotency-Key`. Its fields are `SynthesizeDialogueRequest`.

| Key | Type | |
|---|---|---|
| `turns` | `list<DialogueTurn>` | Required. 1 to 100 turns, each `['voice_id' => …, 'text' => …]`, and optionally its own `language`, `quality` and `speed`. |
| `gap_ms` | `int\|null` | Milliseconds of silence between turns, from 0 to 5000. |
| `language` | `SpeechLanguage\|null` | The language of each turn that doesn't set its own. |
| `quality` | `SpeechQuality\|null` | The quality of each turn that doesn't set its own. |
| `speed` | `float\|int\|null` | The speed of each turn that doesn't set its own. |

### `tts->jobs->create(array $params, array $options = []): TtsJob`

`POST /tts/jobs`. Queues a synthesis, with synthesize's fields, and returns the job at once. Sends an `Idempotency-Key`.

### `tts->jobs->retrieve(string $id, array $options = []): TtsJob`

`GET /tts/jobs/{id}`. The job and where it stands: `queued`, `running`, `succeeded` or `failed`.

### `tts->jobs->audio(string $id, array $options = []): SpeechAudio`

`GET /tts/jobs/{id}/audio`. A succeeded job's WAV. `ConflictException` (409 `job_not_finished` or `job_failed`) before then; `GoneException` (410 `audio_expired`) 24 hours after the job finishes.

### `tts->jobs->createAndWait(array $params, array $options = []): TtsJob`

Creates a job, polls it until it has `succeeded` or `failed`, and returns it. Throws `WaitTimeoutException`, carrying the job as last seen, when the wait runs out. A poll that fails with a connection error, a timeout, or a 429, 500, 502, 503 or 504 is tried again at the next interval until the deadline; any other exception is thrown at once. Pass your own `idempotency_key` to pick up the same job if the wait throws, instead of queuing and billing a second one. It has no `withRawResponse()` twin, since it sends several requests. Its fields are synthesize's, and its options are `WaitOptions`:

| Option | Type | |
|---|---|---|
| `poll_interval` | `float\|int` | Seconds between polls: `2` by default. |
| `timeout` | `float\|int` | Seconds to wait, counted from when the job is created: `600` by default. Each request keeps the client's own timeout, cut to the time left. |
| `idempotency_key` | `string\|null` | The create's `Idempotency-Key`. |
| `max_retries` | `int` | Retries of the create. Each poll is one attempt. |
| `extra_headers` | `array<string, string>` | Headers for every request of the wait. |

## `$client->voices`

### `voices->list(array $query = [], array $options = []): Page<Voice>`

`GET /tts/voices`. Stock voices first, then your ready clones, newest first. Its query is `ListVoicesParams`.

| Key | Type | |
|---|---|---|
| `type` | `'stock'\|'custom'\|null` | Only voices of this type. |
| `language` | `string\|null` | Only voices in this language. |
| `limit` | `int\|null` | Voices per page, from 1 to 100 (50 by default). |
| `cursor` | `string\|null` | A page's `next_cursor`. |

### `voices->retrieve(string $id, array $options = []): Voice`

`GET /tts/voices/{id}`. One voice.

### `voices->create(array $params, array $options = []): Voice`

`POST /tts/voices`, as multipart/form-data. Clones a voice from a reference clip. Sends an `Idempotency-Key`. Its fields are `CreateVoiceRequest`.

| Key | Type | |
|---|---|---|
| `name` | `string` | Required. Up to 120 characters. |
| `language` | `SpeechLanguage` | Required. The language the voice speaks. |
| `ref_audio` | `Uploadable` | Required. A 10–15 second clip: WAV, MP3, OGG or FLAC, at most 10 MB. |
| `ref_text` | `string\|null` | What the clip says, up to 1000 characters. |
| `category` | `VoiceCategory\|string` | What the voice is for. |
| `tags` | `list<string>\|null` | Up to 32 characters each, sent as repeated `tags[]` fields. |

### `voices->update(string $id, array $params, array $options = []): Voice`

`PATCH /tts/voices/{id}`. Changes a clone's `name`, `category`, `language`, `ref_text` or `tags`; only the keys you pass are sent, and a null clears that field. Changing the language or the transcript re-creates the voice, which can take minutes: pass a longer `timeout`. Its fields are `UpdateVoiceRequest`.

### `voices->replaceAudio(string $id, array $params, array $options = []): Voice`

`POST /tts/voices/{id}/audio`, as multipart/form-data. Replaces a clone's reference clip, which re-creates the voice: pass a longer `timeout`. Its fields are `ReplaceVoiceAudioRequest`.

| Key | Type | |
|---|---|---|
| `ref_audio` | `Uploadable` | Required. The new clip, in the formats and size a new clone takes. |
| `ref_text` | `string\|null` | What the new clip says, up to 1000 characters. |

### `voices->delete(string $id, array $options = []): void`

`DELETE /tts/voices/{id}`. Deletes a clone for good.

## `$client->stt`

### `stt->transcribe(array $params, array $options = []): Transcription`

`POST /stt/transcribe`, as multipart/form-data. The text, the language, the duration, timed segments, the price and your balance after the charge. Sends an `Idempotency-Key`. Its fields are `CreateTranscriptionRequest`.

| Key | Type | |
|---|---|---|
| `file` | `Uploadable` | Required. MP3, WAV, OGG, FLAC, M4A or WebM, at most 25 MB. |
| `language` | `TranscriptionLanguage` | Required. The language spoken: `uz`, `ru`, `en`, `kk`, `tk`, `tg`, `tr`, `az`, `ja`, `de` or `ko`. |

## `$client->chat->completions`

### `chat->completions->create(array $params, array $options = []): ChatCompletion|Stream`

`POST /chat/completions`. A model response, billed per token; with `'stream' => true`, a `Stream` of `ChatCompletionChunk` as the answer is generated. Its fields are `CreateChatCompletionRequest`. PHP has no overloads, so the return type is conditional, and PHPStan reads it: `Stream<ChatCompletionChunk>` for `'stream' => true`, `ChatCompletion` without `stream`, or with `false` or null, and either for a `bool` known only at run time. `stream` other than true, false or null throws `NeuronAIException` before anything is sent.

| Key | Type | |
|---|---|---|
| `model` | `string` | Required. A model's id, from `models->list()`. |
| `messages` | `list<ChatMessageParam>` | Required. At least one `['role' => …, 'content' => …]`: `system`, `user`, `assistant` or `tool`, with the text as one string. |
| `max_tokens` | `int\|null` | The most tokens to generate, 1 or more. |
| `temperature` | `float\|int\|null` | From 0 to 2. |
| `top_p` | `float\|int\|null` | From 0 to 1. |
| `stop` | `string\|list<string>\|null` | Text at which the model stops. |
| `stream` | `bool\|null` | True streams the answer. |

## `$client->models`

### `models->list(array $options = []): ModelList`

`GET /models`. The chat models available to your account.

## `$client->embeddings`

### `embeddings->create(array $params, array $options = []): EmbeddingResponse`

`POST /embeddings`. A float vector per input, billed per input token. Its fields are `CreateEmbeddingRequest`.

| Key | Type | |
|---|---|---|
| `model` | `string` | Required. The embedding model's id. |
| `input` | `string\|list<string>` | Required. One text, or a list for a batch. |
| `encoding_format` | `'float'\|null` | Only float vectors are served. |

## `$client->rerank`

### `rerank->create(array $params, array $options = []): RerankResponse`

`POST /rerank`. The documents ranked by relevance to the query, highest first. Its fields are `RerankRequest`.

| Key | Type | |
|---|---|---|
| `model` | `string` | Required. The rerank model's id. |
| `query` | `string` | Required. |
| `documents` | `list<string>` | Required. At least one. |
| `top_n` | `int\|null` | How many of the best documents to return. |
| `return_documents` | `bool\|null` | False leaves out each result's `document`. |

## `$client->account`

### `account->balance(array $options = []): Balance`

`GET /balance`. Your organization's remaining credit, and its prices.

### `account->usage(array $query = [], array $options = []): Usage`

`GET /usage`. Spend and request counts over the last `days` (`7`, `30` or `90`; 30 by default), by service and by API key. Its query is `UsageParams`.

## `$client->apiKeys`

### `apiKeys->list(array $query = [], array $options = []): Page<ApiKey>`

`GET /api-keys`. Your organization's keys, newest first, revoked ones included: `limit` from 1 to 100 (50 by default), and a page's `next_cursor` as `cursor`. Its query is `ListApiKeysParams`.

### `apiKeys->create(array $params, array $options = []): ApiKey`

`POST /api-keys`. Creates a key and returns it with its `secret`, the only time the secret is shown. Only a 429, or a connection that was never made, is retried. Its fields are `CreateApiKeyRequest`.

| Key | Type | |
|---|---|---|
| `name` | `string` | Required. 1 to 80 characters. |
| `access` | `ApiKeyAccess\|string` | Required. `full` or `restricted`. |
| `description` | `string\|null` | Up to 500 characters. |
| `permissions` | `ApiKeyPermissionsParam` | Levels by product, such as `['tts' => 'write']`. |
| `expires_at` | `string\|null` | When the key stops working (ISO 8601). |
| `monthly_spend_limit` | `float\|int\|null` | UZS per calendar month. |
| `allowed_ips` | `list<string>\|null` | Up to 100 addresses or CIDR ranges. |

### `apiKeys->retrieve(string $id, array $options = []): ApiKey`

`GET /api-keys/{id}`. One key.

### `apiKeys->update(string $id, array $params, array $options = []): ApiKey`

`PATCH /api-keys/{id}`. Changes a key: `name`, `description`, `access`, `permissions` (the whole map), `expires_at`, `monthly_spend_limit`, `enabled` or `allowed_ips`. Only the keys you pass are sent, and a null clears that field. Its fields are `UpdateApiKeyRequest`.

### `apiKeys->revoke(string $id, array $options = []): void`

`POST /api-keys/{id}/revoke`. Revokes a key for good.

## Results and helpers

- `SpeechAudio`: `audio` (`string`, the WAV's bytes), `content_type`, `cost`, `character_count`, `balance`, `voice_custom`, `latency_ms`, `replayed`, `request_id`, and `save(string $path): void`. `DialogueAudio` extends it with `turns` (`list<DialogueTurnTiming>`) and `turn_count`.
- A result from an envelope, such as `Voice` or `TtsJob`, has a `request_id`; one from a compatible endpoint, such as `ChatCompletion`, a `cost`. Neither is a field of the body, so `toArray()` and `json_encode()` leave them out.
- `Page<T>`: `data`, `next_cursor`, `request_id`, `hasNextPage()`, `nextPage()`, `toArray()`, and a `foreach` over every item of every page.
- `Stream<T>`: a `foreach` over the chunks, which can run once, and `close()`. Leaving the loop early closes the request.
- `Uploadable`, in `Naiuz\Core\Upload`: a path, as a string, or `FileUpload`: `['stream' => resource, 'filename' => string, 'content_type' => ?string]`, where `content_type` may be left out. A stream is read from its start.
- `RawResponse<T>`: `data`, `status` and `headers` (`array<string, string>`, by lower-case name).
- Exceptions: `NeuronAIException`, `APIConnectionException`, `APITimeoutException`, `APIException` and its status classes, `WaitTimeoutException`; and the `Naiuz\ErrorCode` enum.
