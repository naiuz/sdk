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
| `ref_text` | `string` | Required. What the clip says, up to 1000 characters. |
| `category` | `VoiceCategory\|string` | What the voice is for. |
| `tags` | `list<string>\|null` | Up to 32 characters each, sent as repeated `tags[]` fields. |

### `voices->update(string $id, array $params, array $options = []): Voice`

`PATCH /tts/voices/{id}`. Changes a clone's `name`, `category`, `language`, `ref_text` or `tags`; only the keys you pass are sent, and a null clears that field. Changing the language or the transcript re-creates the voice, which can take minutes: pass a longer `timeout`. Its fields are `UpdateVoiceRequest`.

### `voices->replaceAudio(string $id, array $params, array $options = []): Voice`

`POST /tts/voices/{id}/audio`, as multipart/form-data. Replaces a clone's reference clip, which re-creates the voice: pass a longer `timeout`. Its fields are `ReplaceVoiceAudioRequest`.

| Key | Type | |
|---|---|---|
| `ref_audio` | `Uploadable` | Required. The new clip, in the formats and size a new clone takes. |
| `ref_text` | `string` | What the new clip says, up to 1000 characters. |

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

`GET /balance`. Your organization's remaining credits, and its prices.

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
| `monthly_spend_limit` | `float\|int\|null` | Credits per calendar month. |
| `allowed_ips` | `list<string>\|null` | Up to 100 addresses or CIDR ranges. |

### `apiKeys->retrieve(string $id, array $options = []): ApiKey`

`GET /api-keys/{id}`. One key.

### `apiKeys->update(string $id, array $params, array $options = []): ApiKey`

`PATCH /api-keys/{id}`. Changes a key: `name`, `description`, `access`, `permissions` (the whole map), `expires_at`, `monthly_spend_limit`, `enabled` or `allowed_ips`. Only the keys you pass are sent, and a null clears that field. Its fields are `UpdateApiKeyRequest`.

### `apiKeys->revoke(string $id, array $options = []): void`

`POST /api-keys/{id}/revoke`. Revokes a key for good.

## `$client->agents`

Your organization's agents.

### `agents->list(array $query = [], array $options = []): Page<Agent>`

`GET /agents`. Your organization's agents, the ones changed last first. Loop over the result for every agent, each page fetched when the loop reaches it.

| Key | Type | |
|---|---|---|
| `search` | `string\|null` | Part of the agent's name. |
| `status` | `string\|null` | `draft`, `published` or `paused`. |
| `limit` | `int\|null` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `string\|null` | A page's `next_cursor`, to start from the page after it. |

### `agents->retrieve(string $agent, array $options = []): Agent`

`GET /agents/{agent}`. An agent, with its draft as `config` and the `revision` to change it from.

### `agents->create(array $params, array $options = []): CreatedAgent`

`POST /agents`. Creates an agent from a template. The model fits its prompt to your answers, and `personalized` says when it couldn't.

| Key | Type | |
|---|---|---|
| `template` | `string` | Required. The template to start from: `support`, `sales`, or `blank`, which asks nothing. |
| `language` | `string` | Required. The agent's main language: `uz`, `ru` or `en`. |
| `name` | `string\|null` | The agent's name. The template's when left out. |
| `answers` | `array<string, mixed>` | The answers to the template's questions, by question. `support` and `sales` need `business_name`, `offering`, `goal` and `tone`, and `blank` needs none. The Agents page of the docs lists what each one takes. |

### `agents->update(string $agent, array $params, array $options = []): AgentDraftSaved`

`PATCH /agents/{agent}`. Replaces whole sections of the draft. Someone else's change since you read it raises a conflict: read the agent again. Customers see nothing of this until you publish.

| Key | Type | |
|---|---|---|
| `base_revision` | `int` | Required. The `revision` you read. |
| `sections` | `array<string, mixed>` | Required. The top-level sections of the config to replace, such as `prompt`. |

### `agents->publish(string $agent, array $params, array $options = []): AgentStatus`

`POST /agents/{agent}/publish`. Makes the draft live as a new version. What stands in the way is an error with `fields`, naming each part of the config.

| Key | Type | |
|---|---|---|
| `base_revision` | `int` | Required. The `revision` you read. |
| `note` | `string\|null` | What changed, for the version history. Up to 140 characters. |

### `agents->signedUrl(string $agent, array $query = [], array $options = []): AgentSignedUrl`

`GET /agents/{agent}/signed-url`. A link your page opens a conversation with, for a private agent or to bind a conversation to a customer of yours. It must be used within 15 minutes, once. Make it on your server.

| Key | Type | |
|---|---|---|
| `vars` | `array<string, string\|int\|float\|bool>` | Values for the agent's `{{variables}}` that the page can't change. They travel in the link, so they're not secret. |
| `customer_id` | `string\|null` | Your own id for this customer. Their conversations then share one contact. |

## `$client->conversations`

Your organization's conversations, and carrying one on a channel of your own.

### `conversations->list(array $query = [], array $options = []): Page<Conversation>`

`GET /conversations`. Your organization's conversations from every channel, newest first. Loop over the result for every one, each page fetched when the loop reaches it.

| Key | Type | |
|---|---|---|
| `agent_id` | `string\|null` | Only this agent's. |
| `status` | `string\|null` | Only those in this status, such as `resolved`. |
| `limit` | `int\|null` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `string\|null` | A page's `next_cursor`, to start from the page after it. |

### `conversations->retrieve(string $conversation, array $options = []): Conversation`

`GET /conversations/{conversation}`. One conversation, with its variables, summary and cost, and whether it has audio.

### `conversations->transcript(string $conversation, array $options = []): ConversationTranscript`

`GET /conversations/{conversation}/transcript`. What the customer, the agent and operators said, all in one answer.

### `conversations->audio(string $conversation, array $options = []): SpeechAudio`

`GET /conversations/{conversation}/audio`. The recording of a call, as Ogg Opus. No recording, or one past its time, raises NotFound.

### `conversations->create(array $params, array $options = []): StartedConversation`

`POST /conversations`. A conversation on a channel of your own. Nothing is sent until the customer says something, and then the agent's first message and its answer reach you by webhook.

| Key | Type | |
|---|---|---|
| `agent_id` | `string` | Required. The agent that answers. |
| `contact` | `array` | Who it's with. |
| `variables` | `array<string, string\|int\|float\|bool>` | Values for the agent's `{{variables}}`. |

## `$client->conversations->messages`

What's said in a conversation.

### `conversations->messages->create(string $conversation, array $params, array $options = []): SentConversationMessage`

`POST /conversations/{conversation}/messages`. Stores what the customer said and answers at once, and the agent's reply reaches you by webhook. After the conversation has ended it goes on in the next one, and `conversation_id` says which.

| Key | Type | |
|---|---|---|
| `client_message_id` | `string` | Required. Your own id for this message: letters, digits, `_` and `-`, up to 64. Sending it again stores it once. |
| `text` | `string` | Required. What the customer said, up to 10,000 characters. |

### `conversations->messages->list(string $conversation, array $query = [], array $options = []): Page<ConversationMessage>`

`GET /conversations/{conversation}/messages`. What's been said, oldest first, from wherever you got to. Use it to catch up on anything a webhook missed.

| Key | Type | |
|---|---|---|
| `after` | `string \| int\|null` | The message to read on from. |
| `limit` | `int\|null` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `string\|null` | A page's `next_cursor`, to start from the page after it. |

## `$client->knowledgeBase`

The documents agents answer from.

### `knowledgeBase->list(array $options = []): KnowledgeDocuments`

`GET /knowledge-base`. Your organization's documents, and how much of its room they use.

### `knowledgeBase->retrieve(int|string $document, array $options = []): KnowledgeDocument`

`GET /knowledge-base/{document}`. One document, and how far reading it has got.

### `knowledgeBase->createText(array $params, array $options = []): KnowledgeDocument`

`POST /knowledge-base/text`. Adds text you type in. It's read in the background, and `status` says how far that's got.

| Key | Type | |
|---|---|---|
| `name` | `string` | Required. The document's name. |
| `text` | `string` | Required. Its text, up to 300,000 characters. |

### `knowledgeBase->createQa(array $params, array $options = []): KnowledgeDocument`

`POST /knowledge-base/qa`. Adds pairs of a question and its answer, each found on its own.

| Key | Type | |
|---|---|---|
| `name` | `string` | Required. The document's name. |
| `pairs` | `list<array>` | Required. Up to 2,000 pairs of `question` and `answer`. |

### `knowledgeBase->createLink(array $params, array $options = []): KnowledgeDocument`

`POST /knowledge-base/link`. Adds a website or a Google file by its address, which is read again every week.

| Key | Type | |
|---|---|---|
| `url` | `string` | Required. An https address. |
| `crawl_scope` | `string\|null` | How far to read a website: this `page`, or the whole `site`. |
| `name` | `string\|null` | The document's name, up to 255 characters. The address's host when left out. |

### `knowledgeBase->createFile(array $params, array $options = []): KnowledgeDocument`

`POST /knowledge-base/file`. Adds a file, sent as multipart/form-data.

| Key | Type | |
|---|---|---|
| `file` | `Upload\|string` | Required. A PDF, a Word document, a spreadsheet or a text file. |
| `name` | `string\|null` | The document's name, up to 255 characters. The file's when left out. |

### `knowledgeBase->update(int|string $document, array $params = [], array $options = []): KnowledgeDocument`

`PUT /knowledge-base/{document}`. Changes the name, or what each kind holds. What changes the content is read again.

| Key | Type | |
|---|---|---|
| `name` | `string` | The document's name. |
| `text` | `string` | A text document's text. |
| `pairs` | `list<array>` | A questions document's pairs. |
| `crawl_scope` | `string` | How far to read a website: this `page`, or the whole `site`. |

### `knowledgeBase->refresh(int|string $document, array $options = []): void`

`POST /knowledge-base/{document}/refresh`. Reads a link document again now, or tries a file that failed again.

### `knowledgeBase->delete(int|string $document, array $query = [], array $options = []): void`

`DELETE /knowledge-base/{document}`. Deletes a document.

| Key | Type | |
|---|---|---|
| `detach` | `bool\|null` | Take it off the agents that use it. Without this, one in use raises a conflict naming them. |

## `$client->tools`

The tools agents can use.

### `tools->list(array $options = []): Page<Tool>`

`GET /tools`. Your organization's tools.

### `tools->retrieve(int|string $tool, array $options = []): Tool`

`GET /tools/{tool}`. One tool, with its config. Secrets appear by id, never by value.

### `tools->create(array $params, array $options = []): Tool`

`POST /tools`. Creates a webhook tool, which calls your systems, or a client tool, which runs in your page.

| Key | Type | |
|---|---|---|
| `kind` | `string` | Required. A `webhook` our servers call, or a `client` tool your page runs. |
| `name` | `string` | Required. Its name: small letters, digits and `_`. |
| `description` | `string` | Required. What it does and when to use it, for the model to read. |
| `config` | `array<string, mixed>` | Required. For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`. |
| `last_test_status` | `string\|null` | The result of a test this config passed. |

### `tools->update(int|string $tool, array $params, array $options = []): Tool`

`PUT /tools/{tool}`. Replaces a tool. Agents that use it get the change when it's saved.

| Key | Type | |
|---|---|---|
| `kind` | `string` | Required. A `webhook` our servers call, or a `client` tool your page runs. |
| `name` | `string` | Required. Its name. |
| `description` | `string` | Required. What it does and when to use it. |
| `config` | `array<string, mixed>` | Required. For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`. |
| `last_test_status` | `string\|null` | The result of a test this config passed. |

### `tools->delete(int|string $tool, array $query = [], array $options = []): void`

`DELETE /tools/{tool}`. Deletes a tool.

| Key | Type | |
|---|---|---|
| `detach` | `bool\|null` | Take it off the agents that use it. Without this, one in use raises a conflict naming them. |

## `$client->webhooks`

The addresses that hear of what agents and operators say.

### `webhooks->list(array $options = []): Page<WebhookEndpoint>`

`GET /webhooks`. Your organization's endpoints. A signing secret never appears here.

### `webhooks->retrieve(string $endpoint, array $options = []): WebhookEndpoint`

`GET /webhooks/{endpoint}`. One endpoint, and how its last delivery went.

### `webhooks->create(array $params, array $options = []): CreatedWebhookEndpoint`

`POST /webhooks`. Adds an address to send events to, and returns its signing `secret`: the only time it's shown, so store it now. For owners and admins.

| Key | Type | |
|---|---|---|
| `url` | `string` | Required. A public https address. |
| `events` | `list<string>` | Required. `conversation.message.created` and `conversation.ended`. |

### `webhooks->update(string $endpoint, array $params = [], array $options = []): WebhookEndpoint`

`PATCH /webhooks/{endpoint}`. Changes the address or the events, or turns it off and on. Only what you pass is sent.

| Key | Type | |
|---|---|---|
| `url` | `string` | A public https address. |
| `events` | `list<string>` | What it hears of. |
| `enabled` | `bool` | On or off. Turning it on sends what was waiting. |

### `webhooks->delete(string $endpoint, array $options = []): void`

`DELETE /webhooks/{endpoint}`. Deletes an endpoint, with its deliveries.

### `webhooks->verify(string $body, ?string $signature, string $secret, int $toleranceSeconds = 300, ?int $now = null): WebhookEvent`

Checks a webhook's `X-NeuronAI-Signature` header against the body exactly as it arrived, and returns the event. Anything wrong throws `WebhookVerificationException`. A signature older than `$toleranceSeconds` is refused.


## Results and helpers

- `SpeechAudio`: `audio` (`string`, the WAV's bytes), `content_type`, `cost`, `character_count`, `balance`, `voice_custom`, `latency_ms`, `replayed`, `request_id`, and `save(string $path): void`. `DialogueAudio` extends it with `turns` (`list<DialogueTurnTiming>`) and `turn_count`.
- A result from an envelope, such as `Voice` or `TtsJob`, has a `request_id`; one from a compatible endpoint, such as `ChatCompletion`, a `cost`. Neither is a field of the body, so `toArray()` and `json_encode()` leave them out.
- `Page<T>`: `data`, `next_cursor`, `request_id`, `hasNextPage()`, `nextPage()`, `toArray()`, and a `foreach` over every item of every page.
- `Stream<T>`: a `foreach` over the chunks, which can run once, and `close()`. Leaving the loop early closes the request.
- `Uploadable`, in `Naiuz\Core\Upload`: a path, as a string, or `FileUpload`: `['stream' => resource, 'filename' => string, 'content_type' => ?string]`, where `content_type` may be left out. A stream is read from its start.
- `RawResponse<T>`: `data`, `status` and `headers` (`array<string, string>`, by lower-case name).
- Exceptions: `NeuronAIException`, `APIConnectionException`, `APITimeoutException`, `APIException` and its status classes, `WaitTimeoutException`; and the `Naiuz\ErrorCode` enum.
