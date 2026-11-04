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
| `ref_text` | `string` | Required. What the clip says, up to 1000 characters. |
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

### `chat.completions.create(params: CreateChatCompletionRequestNonStreaming, options?: RequestOptions): APIPromise<WithCost<ChatCompletion>>`

### `chat.completions.create(params: CreateChatCompletionRequestStreaming, options?: RequestOptions): APIPromise<Stream<ChatCompletionChunk>>`

### `chat.completions.create(params: CreateChatCompletionRequest, options?: RequestOptions): APIPromise<WithCost<ChatCompletion> | Stream<ChatCompletionChunk>>`

`POST /chat/completions`. A model response, billed per token; with `stream: true`, a `Stream` of chunks as the answer is generated. Without `stream` (or with `stream: false`), the first overload applies; with `stream: true`, the second; with a `boolean` known only at run time, the third, resolving to the union.

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

`GET /balance`. Your organization's remaining credits, and its prices.

### `account.usage(params?: UsageParams, options?: RequestOptions): APIPromise<WithRequestId<Usage>>`

`GET /usage`. Spend and request counts over the last `days` (`7`, `30` or `90`; 30 by default), by service and by API key.

## `client.apiKeys`

### `apiKeys.list(params?: ListApiKeysParams, options?: RequestOptions): PagePromise<ApiKey>`

`GET /api-keys`. Your organization's keys, newest first, revoked ones included: `limit` from 1 to 100 (50 by default), and a page's `next_cursor` as `cursor`.

### `apiKeys.create(params: CreateApiKeyRequest, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>>`

`POST /api-keys`. Creates a key and resolves with it and its `secret`, the only time the secret is shown. Only a 429 or a connection that was never made is retried.

| Parameter | Type | |
|---|---|---|
| `name` | `string` | Required. 1 to 80 characters. |
| `access` | `ApiKeyAccess` | Required. `full` or `restricted`. |
| `description` | `string \| null` | Up to 500 characters. |
| `permissions` | `Partial<ApiKeyPermissions>` | Levels by product, such as `{tts: "write"}`. |
| `expires_at` | `string \| null` | When the key stops working (ISO 8601). |
| `monthly_spend_limit` | `number \| null` | Credits per calendar month. |
| `allowed_ips` | `string[] \| null` | Up to 100 addresses or CIDR ranges. |

### `apiKeys.retrieve(id: string, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>>`

`GET /api-keys/{id}`. One key.

### `apiKeys.update(id: string, params: UpdateApiKeyRequest, options?: RequestOptions): APIPromise<WithRequestId<ApiKey>>`

`PATCH /api-keys/{id}`. Changes a key: `name`, `description`, `access`, `permissions` (the whole map), `expires_at`, `monthly_spend_limit`, `enabled` or `allowed_ips`. Send only the fields to change.

### `apiKeys.revoke(id: string, options?: RequestOptions): APIPromise<void>`

`POST /api-keys/{id}/revoke`. Revokes a key for good.

## `client.agents`

Your organization's agents.

### `agents.list(params?: ListAgentsParams, options?: RequestOptions): PagePromise<Agent>`

`GET /agents`. Your organization's agents, the ones changed last first. Loop over the result for every agent, each page fetched when the loop reaches it.

| Parameter | Type | |
|---|---|---|
| `search` | `string \| null` | Part of the agent's name. |
| `status` | `string \| null` | `draft`, `published` or `paused`. |
| `limit` | `number \| null` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `string \| null` | A page's `next_cursor`, to start from the page after it. |

### `agents.retrieve(agent: string, options?: RequestOptions): APIPromise<WithRequestId<Agent>>`

`GET /agents/{agent}`. An agent, with its draft as `config` and the `revision` to change it from.

### `agents.create(params: CreateAgentRequest, options?: RequestOptions): APIPromise<WithRequestId<CreatedAgent>>`

`POST /agents`. Creates an agent from a template. The model fits its prompt to your answers, and `personalized` says when it couldn't.

| Parameter | Type | |
|---|---|---|
| `template` | `string` | Required. The template: `support` or `sales`. |
| `language` | `string` | Required. The agent's main language: `uz`, `ru` or `en`. |
| `name` | `string \| null` | The agent's name. The template's when left out. |
| `answers` | `Record<string, unknown>` | The answers to the template's questions, by question. |

### `agents.update(agent: string, params: UpdateAgentRequest, options?: RequestOptions): APIPromise<WithRequestId<AgentDraftSaved>>`

`PATCH /agents/{agent}`. Replaces whole sections of the draft. Someone else's change since you read it raises a conflict: read the agent again. Customers see nothing of this until you publish.

| Parameter | Type | |
|---|---|---|
| `base_revision` | `number` | Required. The `revision` you read. |
| `sections` | `Record<string, unknown>` | Required. The top-level sections of the config to replace, such as `prompt`. |

### `agents.publish(agent: string, params: PublishAgentRequest, options?: RequestOptions): APIPromise<WithRequestId<AgentStatus>>`

`POST /agents/{agent}/publish`. Makes the draft live as a new version. What stands in the way is an error with `fields`, naming each part of the config.

| Parameter | Type | |
|---|---|---|
| `base_revision` | `number` | Required. The `revision` you read. |
| `note` | `string \| null` | What changed, for the version history. Up to 140 characters. |

### `agents.signedUrl(agent: string, params?: AgentSignedUrlParams, options?: RequestOptions): APIPromise<WithRequestId<AgentSignedUrl>>`

`GET /agents/{agent}/signed-url`. A link your page opens a conversation with, for a private agent or to bind a conversation to a customer of yours. It must be used within 15 minutes, once. Make it on your server.

| Parameter | Type | |
|---|---|---|
| `vars` | `Record<string, string \| number \| boolean>` | Values for the agent's `{{variables}}` that the page can't change. They travel in the link, so they're not secret. |
| `customer_id` | `string \| null` | Your own id for this customer. Their conversations then share one contact. |

## `client.conversations`

Your organization's conversations, and carrying one on a channel of your own.

### `conversations.list(params?: ListConversationsParams, options?: RequestOptions): PagePromise<Conversation>`

`GET /conversations`. Your organization's conversations from every channel, newest first. Loop over the result for every one, each page fetched when the loop reaches it.

| Parameter | Type | |
|---|---|---|
| `agent_id` | `string \| null` | Only this agent's. |
| `status` | `string \| null` | Only those in this status, such as `resolved`. |
| `limit` | `number \| null` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `string \| null` | A page's `next_cursor`, to start from the page after it. |

### `conversations.retrieve(conversation: string, options?: RequestOptions): APIPromise<WithRequestId<Conversation>>`

`GET /conversations/{conversation}`. One conversation, with its variables, summary and cost, and whether it has audio.

### `conversations.transcript(conversation: string, options?: RequestOptions): APIPromise<WithRequestId<ConversationTranscript>>`

`GET /conversations/{conversation}/transcript`. What the customer, the agent and operators said, all in one answer.

### `conversations.audio(conversation: string, options?: RequestOptions): APIPromise<SpeechAudio>`

`GET /conversations/{conversation}/audio`. The recording of a call, as Ogg Opus. No recording, or one past its time, raises NotFound.

### `conversations.create(params: CreateConversationRequest, options?: RequestOptions): APIPromise<WithRequestId<StartedConversation>>`

`POST /conversations`. A conversation on a channel of your own. Nothing is sent until the customer says something, and then the agent's first message and its answer reach you by webhook.

| Parameter | Type | |
|---|---|---|
| `agent_id` | `string` | Required. The agent that answers. |
| `contact` | `ConversationContactParam` | Who it's with. |
| `variables` | `Record<string, string \| number \| boolean>` | Values for the agent's `{{variables}}`. |

## `client.conversations.messages`

What's said in a conversation.

### `conversations.messages.create(conversation: string, params: CreateConversationMessageRequest, options?: RequestOptions): APIPromise<WithRequestId<SentConversationMessage>>`

`POST /conversations/{conversation}/messages`. Stores what the customer said and answers at once, and the agent's reply reaches you by webhook. After the conversation has ended it goes on in the next one, and `conversation_id` says which.

| Parameter | Type | |
|---|---|---|
| `client_message_id` | `string` | Required. Your own id for this message: letters, digits, `_` and `-`, up to 64. Sending it again stores it once. |
| `text` | `string` | Required. What the customer said, up to 10,000 characters. |

### `conversations.messages.list(conversation: string, params?: ListConversationMessagesParams, options?: RequestOptions): PagePromise<ConversationMessage>`

`GET /conversations/{conversation}/messages`. What's been said, oldest first, from wherever you got to. Use it to catch up on anything a webhook missed.

| Parameter | Type | |
|---|---|---|
| `after` | `string \| number \| null` | The message to read on from. |
| `limit` | `number \| null` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `string \| null` | A page's `next_cursor`, to start from the page after it. |

## `client.knowledgeBase`

The documents agents answer from.

### `knowledgeBase.list(options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocuments>>`

`GET /knowledge-base`. Your organization's documents, and how much of its room they use.

### `knowledgeBase.retrieve(document: string | number, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>>`

`GET /knowledge-base/{document}`. One document, and how far reading it has got.

### `knowledgeBase.createText(params: CreateTextDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>>`

`POST /knowledge-base/text`. Adds text you type in. It's read in the background, and `status` says how far that's got.

| Parameter | Type | |
|---|---|---|
| `name` | `string` | Required. The document's name. |
| `text` | `string` | Required. Its text. |

### `knowledgeBase.createQa(params: CreateQaDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>>`

`POST /knowledge-base/qa`. Adds pairs of a question and its answer, each found on its own.

| Parameter | Type | |
|---|---|---|
| `name` | `string` | Required. The document's name. |
| `pairs` | `DocumentPairParam[]` | Required. Up to 2,000 pairs of `question` and `answer`. |

### `knowledgeBase.createLink(params: CreateLinkDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>>`

`POST /knowledge-base/link`. Adds a website or a Google file by its address, which is read again every week.

| Parameter | Type | |
|---|---|---|
| `url` | `string` | Required. An https address. |
| `crawl_scope` | `string \| null` | How far to read a website: `page`, `section` or `site`. |
| `name` | `string \| null` | The document's name. The page's title when left out. |

### `knowledgeBase.createFile(params: CreateFileDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>>`

`POST /knowledge-base/file`. Adds a file, sent as multipart/form-data.

| Parameter | Type | |
|---|---|---|
| `file` | `FileUpload` | Required. A PDF, a Word document, a spreadsheet or a text file. |
| `name` | `string \| null` | The document's name. The file's when left out. |

### `knowledgeBase.update(document: string | number, params?: UpdateDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>>`

`PUT /knowledge-base/{document}`. Changes the name, or what each kind holds. What changes the content is read again.

| Parameter | Type | |
|---|---|---|
| `name` | `string` | The document's name. |
| `text` | `string` | A text document's text. |
| `pairs` | `DocumentPairParam[]` | A questions document's pairs. |
| `crawl_scope` | `string` | How far to read a website. |

### `knowledgeBase.refresh(document: string | number, options?: RequestOptions): APIPromise<void>`

`POST /knowledge-base/{document}/refresh`. Reads a link document again now.

### `knowledgeBase.delete(document: string | number, params?: DeleteDocumentParams, options?: RequestOptions): APIPromise<void>`

`DELETE /knowledge-base/{document}`. Deletes a document.

| Parameter | Type | |
|---|---|---|
| `detach` | `boolean \| null` | Take it off the agents that use it. Without this, one in use raises a conflict naming them. |

## `client.tools`

The tools agents can use.

### `tools.list(options?: RequestOptions): PagePromise<Tool>`

`GET /tools`. Your organization's tools.

### `tools.retrieve(tool: string | number, options?: RequestOptions): APIPromise<WithRequestId<Tool>>`

`GET /tools/{tool}`. One tool, with its config. Secrets appear by id, never by value.

### `tools.create(params: SaveToolRequest, options?: RequestOptions): APIPromise<WithRequestId<Tool>>`

`POST /tools`. Creates a webhook tool, which calls your systems, or a client tool, which runs in your page.

| Parameter | Type | |
|---|---|---|
| `kind` | `string` | Required. `webhook` or `client`. |
| `name` | `string` | Required. Its name: small letters, digits and `_`. |
| `description` | `string` | Required. What it does and when to use it, for the model to read. |
| `config` | `Record<string, unknown>` | Required. What it calls, with its parameters. |
| `last_test_status` | `string \| null` | The result of a test this config passed. |

### `tools.update(tool: string | number, params: SaveToolRequest, options?: RequestOptions): APIPromise<WithRequestId<Tool>>`

`PUT /tools/{tool}`. Replaces a tool. Agents that use it get the change when it's saved.

| Parameter | Type | |
|---|---|---|
| `kind` | `string` | Required. `webhook` or `client`. |
| `name` | `string` | Required. Its name. |
| `description` | `string` | Required. What it does and when to use it. |
| `config` | `Record<string, unknown>` | Required. What it calls, with its parameters. |
| `last_test_status` | `string \| null` | The result of a test this config passed. |

### `tools.delete(tool: string | number, params?: DeleteToolParams, options?: RequestOptions): APIPromise<void>`

`DELETE /tools/{tool}`. Deletes a tool.

| Parameter | Type | |
|---|---|---|
| `detach` | `boolean \| null` | Take it off the agents that use it. Without this, one in use raises a conflict naming them. |

## `client.webhooks`

The addresses that hear of what agents and operators say.

### `webhooks.list(options?: RequestOptions): PagePromise<WebhookEndpoint>`

`GET /webhooks`. Your organization's endpoints. A signing secret never appears here.

### `webhooks.retrieve(endpoint: string, options?: RequestOptions): APIPromise<WithRequestId<WebhookEndpoint>>`

`GET /webhooks/{endpoint}`. One endpoint, and how its last delivery went.

### `webhooks.create(params: CreateWebhookEndpointRequest, options?: RequestOptions): APIPromise<WithRequestId<CreatedWebhookEndpoint>>`

`POST /webhooks`. Adds an address to send events to, and returns its signing `secret`: the only time it's shown, so store it now. For owners and admins.

| Parameter | Type | |
|---|---|---|
| `url` | `string` | Required. A public https address. |
| `events` | `string[]` | Required. `conversation.message.created` and `conversation.ended`. |

### `webhooks.update(endpoint: string, params?: UpdateWebhookEndpointRequest, options?: RequestOptions): APIPromise<WithRequestId<WebhookEndpoint>>`

`PATCH /webhooks/{endpoint}`. Changes the address or the events, or turns it off and on. Only what you pass is sent.

| Parameter | Type | |
|---|---|---|
| `url` | `string` | A public https address. |
| `events` | `string[]` | What it hears of. |
| `enabled` | `boolean` | On or off. Turning it on sends what was waiting. |

### `webhooks.delete(endpoint: string, options?: RequestOptions): APIPromise<void>`

`DELETE /webhooks/{endpoint}`. Deletes an endpoint, with its deliveries.

### `webhooks.verify(body: string, signature: string | null | undefined, secret: string, options?: VerifyWebhookOptions): Promise<WebhookEvent>`

Checks a webhook's `X-NeuronAI-Signature` header against the body exactly as it arrived, and resolves with the event. Anything wrong rejects with `WebhookVerificationError`. A signature older than `toleranceSeconds`, 300 by default, is refused.


## Results and helpers

- `SpeechAudio`: `audio` (`Uint8Array`), `content_type`, `cost`, `character_count`, `balance`, `voice_custom`, `latency_ms`, `replayed`, `request_id`, and `save(path): Promise<void>`. `DialogueAudio` adds `turns` (`DialogueTurnTiming[]`) and `turn_count`.
- `Page<T>`: `data`, `next_cursor`, `request_id`, `hasNextPage()`, `nextPage(): PagePromise<T>`, and `for await` over every item. `PagePromise<T>` is the `APIPromise` of a page, and loops the same way.
- `Stream<T>`: `for await` over the chunks, `close()`, and `toReadableStream(): ReadableStream<Uint8Array>`.
- `Uploadable`: a `File`, or `FileUpload`: `{data: Uint8Array | Blob, filename: string, contentType?: string}`.
- Errors: `NeuronAIError`, `APIConnectionError`, `APITimeoutError`, `APIError` and its status classes, `WaitTimeoutError`, and the `ErrorCode` enum.
