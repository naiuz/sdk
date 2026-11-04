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

### `voices.create(*, name, language, ref_audio, ref_text, category=, tags=, idempotency_key=None) -> Voice`

`POST /tts/voices`, as multipart/form-data. Clones a voice from a reference clip. Sends an `Idempotency-Key`.

| Parameter | Type | |
|---|---|---|
| `name` | `str` | Required. Up to 120 characters. |
| `language` | `SpeechLanguage` | Required. The language the voice speaks. |
| `ref_audio` | `Uploadable` | Required. A 10–15 second clip: WAV, MP3, OGG or FLAC, at most 10 MB. |
| `ref_text` | `str` | Required. What the clip says, up to 1000 characters. |
| `category` | `VoiceCategory` | What the voice is for. |
| `tags` | `Sequence[str] \| None` | Up to 32 characters each, sent as repeated `tags[]` fields. |

### `voices.update(id, *, name=, category=, language=, ref_text=, tags=) -> Voice`

`PATCH /tts/voices/{id}`. Changes a clone's `name`, `category`, `language`, `ref_text` or `tags`; only the fields you pass are sent. Changing the language or the transcript re-creates the voice, which can take minutes: pass a longer `timeout`.

### `voices.replace_audio(id, *, ref_audio, ref_text=) -> Voice`

`POST /tts/voices/{id}/audio`, as multipart/form-data. Replaces a clone's reference clip, which re-creates the voice: pass a longer `timeout`.

| Parameter | Type | |
|---|---|---|
| `ref_audio` | `Uploadable` | Required. The new clip, in the formats and size a new clone takes. |
| `ref_text` | `str` | What the new clip says, up to 1000 characters. |

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

`GET /balance`. Your organization's remaining credits, and its prices.

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
| `monthly_spend_limit` | `float \| None` | Credits per calendar month. |
| `allowed_ips` | `Sequence[str] \| None` | Up to 100 addresses or CIDR ranges. |

### `api_keys.retrieve(id) -> ApiKey`

`GET /api-keys/{id}`. One key.

### `api_keys.update(id, *, name=, description=, access=, permissions=, expires_at=, monthly_spend_limit=, enabled=, allowed_ips=) -> ApiKey`

`PATCH /api-keys/{id}`. Changes a key: `name`, `description`, `access`, `permissions` (the whole map), `expires_at`, `monthly_spend_limit`, `enabled` or `allowed_ips`. Only the fields you pass are sent, and None sends null, which clears that field.

### `api_keys.revoke(id) -> None`

`POST /api-keys/{id}/revoke`. Revokes a key for good.

## `client.agents`

Your organization's agents.

### `agents.list(*, search=None, status=None, limit=None, cursor=None) -> Page[Agent]`

`GET /agents`. Your organization's agents, the ones changed last first. Loop over the result for every agent, each page fetched when the loop reaches it.

| Parameter | Type | |
|---|---|---|
| `search` | `str \| None` | Part of the agent's name. |
| `status` | `str \| None` | `draft`, `published` or `paused`. |
| `limit` | `int \| None` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `str \| None` | A page's `next_cursor`, to start from the page after it. |

### `agents.retrieve(agent) -> Agent`

`GET /agents/{agent}`. An agent, with its draft as `config` and the `revision` to change it from.

### `agents.create(*, template, language, name=, answers=) -> CreatedAgent`

`POST /agents`. Creates an agent from a template. The model fits its prompt to your answers, and `personalized` says when it couldn't.

| Parameter | Type | |
|---|---|---|
| `template` | `str` | Required. The template to start from: `support`, `sales`, or `blank`, which asks nothing. |
| `language` | `str` | Required. The agent's main language: `uz`, `ru` or `en`. |
| `name` | `str \| None` | The agent's name. The template's when left out. |
| `answers` | `Mapping[str, object]` | The answers to the template's questions, by question. `support` and `sales` need `business_name`, `offering`, `goal` and `tone`, and `blank` needs none. The Agents page of the docs lists what each one takes. |

### `agents.update(agent, *, base_revision, sections) -> AgentDraftSaved`

`PATCH /agents/{agent}`. Replaces whole sections of the draft. Someone else's change since you read it raises a conflict: read the agent again. Customers see nothing of this until you publish.

| Parameter | Type | |
|---|---|---|
| `base_revision` | `int` | Required. The `revision` you read. |
| `sections` | `Mapping[str, object]` | Required. The top-level sections of the config to replace, such as `prompt`. |

### `agents.publish(agent, *, base_revision, note=) -> AgentStatus`

`POST /agents/{agent}/publish`. Makes the draft live as a new version. What stands in the way is an error with `fields`, naming each part of the config.

| Parameter | Type | |
|---|---|---|
| `base_revision` | `int` | Required. The `revision` you read. |
| `note` | `str \| None` | What changed, for the version history. Up to 140 characters. |

### `agents.signed_url(agent, *, vars=None, customer_id=None) -> AgentSignedUrl`

`GET /agents/{agent}/signed-url`. A link your page opens a conversation with, for a private agent or to bind a conversation to a customer of yours. It must be used within 15 minutes, once. Make it on your server.

| Parameter | Type | |
|---|---|---|
| `vars` | `Mapping[str, str \| int \| float \| bool]` | Values for the agent's `{{variables}}` that the page can't change. They travel in the link, so they're not secret. |
| `customer_id` | `str \| None` | Your own id for this customer. Their conversations then share one contact. |

## `client.conversations`

Your organization's conversations, and carrying one on a channel of your own.

### `conversations.list(*, agent_id=None, status=None, limit=None, cursor=None) -> Page[Conversation]`

`GET /conversations`. Your organization's conversations from every channel, newest first. Loop over the result for every one, each page fetched when the loop reaches it.

| Parameter | Type | |
|---|---|---|
| `agent_id` | `str \| None` | Only this agent's. |
| `status` | `str \| None` | Only those in this status, such as `resolved`. |
| `limit` | `int \| None` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `str \| None` | A page's `next_cursor`, to start from the page after it. |

### `conversations.retrieve(conversation) -> Conversation`

`GET /conversations/{conversation}`. One conversation, with its variables, summary and cost, and whether it has audio.

### `conversations.transcript(conversation) -> ConversationTranscript`

`GET /conversations/{conversation}/transcript`. What the customer, the agent and operators said, all in one answer.

### `conversations.audio(conversation) -> SpeechAudio`

`GET /conversations/{conversation}/audio`. The recording of a call, as Ogg Opus. No recording, or one past its time, raises NotFound.

### `conversations.create(*, agent_id, contact=, variables=) -> StartedConversation`

`POST /conversations`. A conversation on a channel of your own. Nothing is sent until the customer says something, and then the agent's first message and its answer reach you by webhook.

| Parameter | Type | |
|---|---|---|
| `agent_id` | `str` | Required. The agent that answers. |
| `contact` | `ConversationContactParam` | Who it's with. |
| `variables` | `Mapping[str, str \| int \| float \| bool]` | Values for the agent's `{{variables}}`. |

## `client.conversations.messages`

What's said in a conversation.

### `conversations.messages.create(conversation, *, client_message_id, text) -> SentConversationMessage`

`POST /conversations/{conversation}/messages`. Stores what the customer said and answers at once, and the agent's reply reaches you by webhook. After the conversation has ended it goes on in the next one, and `conversation_id` says which.

| Parameter | Type | |
|---|---|---|
| `client_message_id` | `str` | Required. Your own id for this message: letters, digits, `_` and `-`, up to 64. Sending it again stores it once. |
| `text` | `str` | Required. What the customer said, up to 10,000 characters. |

### `conversations.messages.list(conversation, *, after=None, limit=None, cursor=None) -> Page[ConversationMessage]`

`GET /conversations/{conversation}/messages`. What's been said, oldest first, from wherever you got to. Use it to catch up on anything a webhook missed.

| Parameter | Type | |
|---|---|---|
| `after` | `str \| int \| None` | The message to read on from. |
| `limit` | `int \| None` | How many, from 1 to 100 (50 when left out). |
| `cursor` | `str \| None` | A page's `next_cursor`, to start from the page after it. |

## `client.knowledge_base`

The documents agents answer from.

### `knowledge_base.list() -> KnowledgeDocuments`

`GET /knowledge-base`. Your organization's documents, and how much of its room they use.

### `knowledge_base.retrieve(document) -> KnowledgeDocument`

`GET /knowledge-base/{document}`. One document, and how far reading it has got.

### `knowledge_base.create_text(*, name, text) -> KnowledgeDocument`

`POST /knowledge-base/text`. Adds text you type in. It's read in the background, and `status` says how far that's got.

| Parameter | Type | |
|---|---|---|
| `name` | `str` | Required. The document's name. |
| `text` | `str` | Required. Its text, up to 300,000 characters. |

### `knowledge_base.create_qa(*, name, pairs) -> KnowledgeDocument`

`POST /knowledge-base/qa`. Adds pairs of a question and its answer, each found on its own.

| Parameter | Type | |
|---|---|---|
| `name` | `str` | Required. The document's name. |
| `pairs` | `Sequence[DocumentPairParam]` | Required. Up to 2,000 pairs of `question` and `answer`. |

### `knowledge_base.create_link(*, url, crawl_scope=, name=) -> KnowledgeDocument`

`POST /knowledge-base/link`. Adds a website or a Google file by its address, which is read again every week.

| Parameter | Type | |
|---|---|---|
| `url` | `str` | Required. An https address. |
| `crawl_scope` | `str \| None` | How far to read a website: this `page`, or the whole `site`. |
| `name` | `str \| None` | The document's name, up to 255 characters. The address's host when left out. |

### `knowledge_base.create_file(*, file, name=) -> KnowledgeDocument`

`POST /knowledge-base/file`. Adds a file, sent as multipart/form-data.

| Parameter | Type | |
|---|---|---|
| `file` | `Uploadable` | Required. A PDF, a Word document, a spreadsheet or a text file. |
| `name` | `str \| None` | The document's name, up to 255 characters. The file's when left out. |

### `knowledge_base.update(document, *, name=, text=, pairs=, crawl_scope=) -> KnowledgeDocument`

`PUT /knowledge-base/{document}`. Changes the name, or what each kind holds. What changes the content is read again.

| Parameter | Type | |
|---|---|---|
| `name` | `str` | The document's name. |
| `text` | `str` | A text document's text. |
| `pairs` | `Sequence[DocumentPairParam]` | A questions document's pairs. |
| `crawl_scope` | `str` | How far to read a website: this `page`, or the whole `site`. |

### `knowledge_base.refresh(document) -> None`

`POST /knowledge-base/{document}/refresh`. Reads a link document again now, or tries a file that failed again.

### `knowledge_base.delete(document, *, detach=None) -> None`

`DELETE /knowledge-base/{document}`. Deletes a document.

| Parameter | Type | |
|---|---|---|
| `detach` | `bool \| None` | Take it off the agents that use it. Without this, one in use raises a conflict naming them. |

## `client.tools`

The tools agents can use.

### `tools.list() -> Page[Tool]`

`GET /tools`. Your organization's tools.

### `tools.retrieve(tool) -> Tool`

`GET /tools/{tool}`. One tool, with its config. Secrets appear by id, never by value.

### `tools.create(*, kind, name, description, config, last_test_status=) -> Tool`

`POST /tools`. Creates a webhook tool, which calls your systems, or a client tool, which runs in your page.

| Parameter | Type | |
|---|---|---|
| `kind` | `str` | Required. A `webhook` our servers call, or a `client` tool your page runs. |
| `name` | `str` | Required. Its name: small letters, digits and `_`. |
| `description` | `str` | Required. What it does and when to use it, for the model to read. |
| `config` | `Mapping[str, object]` | Required. For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`. |
| `last_test_status` | `str \| None` | The result of a test this config passed. |

### `tools.update(tool, *, kind, name, description, config, last_test_status=) -> Tool`

`PUT /tools/{tool}`. Replaces a tool. Agents that use it get the change when it's saved.

| Parameter | Type | |
|---|---|---|
| `kind` | `str` | Required. A `webhook` our servers call, or a `client` tool your page runs. |
| `name` | `str` | Required. Its name. |
| `description` | `str` | Required. What it does and when to use it. |
| `config` | `Mapping[str, object]` | Required. For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`. |
| `last_test_status` | `str \| None` | The result of a test this config passed. |

### `tools.delete(tool, *, detach=None) -> None`

`DELETE /tools/{tool}`. Deletes a tool.

| Parameter | Type | |
|---|---|---|
| `detach` | `bool \| None` | Take it off the agents that use it. Without this, one in use raises a conflict naming them. |

## `client.webhooks`

The addresses that hear of what agents and operators say.

### `webhooks.list() -> Page[WebhookEndpoint]`

`GET /webhooks`. Your organization's endpoints. A signing secret never appears here.

### `webhooks.retrieve(endpoint) -> WebhookEndpoint`

`GET /webhooks/{endpoint}`. One endpoint, and how its last delivery went.

### `webhooks.create(*, url, events) -> CreatedWebhookEndpoint`

`POST /webhooks`. Adds an address to send events to, and returns its signing `secret`: the only time it's shown, so store it now. For owners and admins.

| Parameter | Type | |
|---|---|---|
| `url` | `str` | Required. A public https address. |
| `events` | `Sequence[str]` | Required. `conversation.message.created` and `conversation.ended`. |

### `webhooks.update(endpoint, *, url=, events=, enabled=) -> WebhookEndpoint`

`PATCH /webhooks/{endpoint}`. Changes the address or the events, or turns it off and on. Only what you pass is sent.

| Parameter | Type | |
|---|---|---|
| `url` | `str` | A public https address. |
| `events` | `Sequence[str]` | What it hears of. |
| `enabled` | `bool` | On or off. Turning it on sends what was waiting. |

### `webhooks.delete(endpoint) -> None`

`DELETE /webhooks/{endpoint}`. Deletes an endpoint, with its deliveries.

### `webhooks.verify(body, signature, secret, *, tolerance_seconds=300, now=None) -> WebhookEvent`

Checks a webhook's `X-NeuronAI-Signature` header against the body exactly as it arrived, and returns the event. Anything wrong raises `WebhookVerificationError`. A signature older than `tolerance_seconds` is refused.


## Results and helpers

- `SpeechAudio`: `audio` (`bytes`), `content_type`, `cost`, `character_count`, `balance`, `voice_custom`, `latency_ms`, `replayed`, `request_id`, and `save(path)`. `DialogueAudio` adds `turns` (`list[DialogueTurnTiming]`) and `turn_count`.
- A result from an envelope, such as `Voice` or `TtsJob`, has a read-only `request_id`; one from a compatible endpoint, such as `ChatCompletion`, a read-only `cost`. Neither is a field, so `model_dump()` leaves them out.
- `Page[T]` (`AsyncPage[T]`): `data`, `next_cursor`, `request_id`, `has_next_page()`, `next_page()`, and a loop over every item.
- `Stream[T]` (`AsyncStream[T]`): a loop over the chunks, `close()`, and a `with` block (`async with`) that closes it.
- `Uploadable`: a path (`str` or `Path`), a `(filename, content)` or `(filename, content, content_type)` tuple whose content is `bytes` or a binary file object, or a binary file object with a name.
- `RawResponse[T]`: `data`, `status` and `headers` (`httpx.Headers`).
- Errors: `NeuronAIError`, `APIConnectionError`, `APITimeoutError`, `APIError` and its status classes, `WaitTimeoutError`, and the `ErrorCode` enum.
