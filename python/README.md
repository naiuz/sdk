# NeuronAI Python SDK

The official Python client for the NeuronAI API: speech synthesis and dialogue, voice cloning, transcription, chat completions, embeddings and rerank. It runs on Python 3.10 to 3.14, with a sync and an async client, and depends only on httpx and pydantic.

## Install

```bash
pip install naiuz
```

With uv, run `uv add naiuz`.

## Quickstart

Create an API key in your NeuronAI dashboard at https://my.neuronai.uz and put it in the `NEURONAI_API_KEY` environment variable.

```python
from naiuz import NeuronAI

client = NeuronAI()

speech = client.tts.synthesize(text="Assalomu alaykum!", voice_id="kamron", language="uz")
speech.save("salom.wav")
print(f"{speech.character_count} characters, {speech.cost} credits")

answer = client.chat.completions.create(
    model="gemma-4-26b-a4b",
    messages=[{"role": "user", "content": "Salom! Bugun ob-havo qanday?"}],
)
print(answer.choices[0].message.content)
```

`AsyncNeuronAI` has the same resources and methods, each awaited:

```python
import asyncio

from naiuz import AsyncNeuronAI


async def main() -> None:
    async with AsyncNeuronAI() as client:
        speech = await client.tts.synthesize(text="Assalomu alaykum!", voice_id="kamron", language="uz")
        speech.save("salom.wav")


asyncio.run(main())
```

## The client

```python
from naiuz import NeuronAI

client = NeuronAI(
    api_key="nai_...",  # else NEURONAI_API_KEY
    base_url="https://my.neuronai.uz/api/v1",  # else NEURONAI_BASE_URL, else this address
    timeout=300,  # seconds each attempt may take: 5 minutes by default
    max_retries=2,  # retries of a failed attempt: 2 by default
    default_headers={"x-app": "shop"},  # sent with every call
)
```

- A client without a key raises `NeuronAIError` at construction, never on the first call. The key is trimmed, and a key with a space or a line break inside is refused.
- The key never appears in an error, in a log, or when the client is printed.
- `http_client` takes your own `httpx.Client` (`httpx.AsyncClient` for `AsyncNeuronAI`), for proxies and tests. Each call still gets the SDK's own timeout, and the client stays yours to close. One built with `follow_redirects=True` follows a redirect as httpx does, which turns a redirected POST into a GET.
- `client.close()`, or leaving a `with` block (`async with` for `AsyncNeuronAI`), closes the httpx client the SDK made.

## What's in it

| Resource | Methods |
|---|---|
| `client.tts` | `synthesize`, `dialogue` |
| `client.tts.jobs` | `create`, `retrieve`, `audio`, `create_and_wait` |
| `client.voices` | `list`, `retrieve`, `create`, `update`, `replace_audio`, `delete` |
| `client.stt` | `transcribe` |
| `client.chat.completions` | `create`, streamed or not |
| `client.models` | `list` |
| `client.embeddings` | `create` |
| `client.rerank` | `create` |
| `client.account` | `balance`, `usage` |
| `client.api_keys` | `list`, `create`, `retrieve`, `update`, `revoke` |

[api.md](https://github.com/naiuz/sdk/blob/main/python/api.md) lists every method with its parameters and what it returns. Methods are snake_case, and request and response fields keep the API's own names, such as `voice_id` and `next_cursor`. Every parameter is a keyword argument, except a path's `id`.

## Speech

`tts.synthesize` returns a `SpeechAudio`: the WAV file's bytes, and what the answer's headers say about them.

```python
speech = client.tts.synthesize(text="Xush kelibsiz!", voice_id="kamron", quality="high")
speech.save("welcome.wav")
```

| Field | |
|---|---|
| `audio` | `bytes`: the WAV file |
| `content_type` | `"audio/wav"` |
| `cost` | the price billed, in credits (`X-Cost`) |
| `character_count` | the characters billed (`X-Character-Count`); an emotion tag counts as one |
| `balance` | your balance after the charge (`X-Balance`) |
| `voice_custom` | whether the voice is one of your clones (`X-Voice-Custom`) |
| `latency_ms` | how long the voice took (`X-Latency-Ms`) |
| `replayed` | whether this answer replays an earlier call with the same Idempotency-Key |
| `request_id` | the request's ID (`X-Request-Id`), to quote to support |

The number fields are None when the answer lacks their header. `save(path)` writes the file, replacing one already there; it raises `NeuronAIError` when it can't.

`tts.dialogue` renders a multi-speaker script into one WAV and returns a `DialogueAudio`, which adds where each turn sits in the audio:

```python
dialogue = client.tts.dialogue(
    turns=[
        {"voice_id": "voice-a", "text": "Assalomu alaykum!"},
        {"voice_id": "voice-b", "text": "Va alaykum assalom!"},
    ],
    gap_ms=300,
)
for turn in dialogue.turns:
    print(turn.index, turn.voice_id, turn.start_s, turn.end_s)
print(dialogue.turn_count)
```

## Synthesis jobs

For a long text, queue a job instead of waiting on one call. `tts.jobs.create_and_wait` creates the job, polls it every 2 seconds, and returns it once it has `succeeded` or `failed`:

```python
from naiuz import WaitTimeoutError

long_text = "Bir bor ekan, bir yo'q ekan. " * 100
try:
    job = client.tts.jobs.create_and_wait(
        text=long_text, voice_id="kamron", idempotency_key="chapter-7", poll_interval=2, timeout=600
    )
except WaitTimeoutError as error:
    # The wait ran out first: the job may still finish, so fetch its audio later.
    print(f"Still {error.job.status}: {error.job.id}")
else:
    if job.status == "succeeded":
        client.tts.jobs.audio(job.id).save("chapter.wav")
    elif job.error is not None:
        print(job.error.code, job.error.message)
```

- `timeout` counts from when the job is created: 10 minutes by default. Each request keeps the client's own timeout, cut to the time left. The async client abandons a poll still in flight at the deadline. The sync client can't interrupt one, so the time left bounds it instead, and a silent connection can hold it about that long again.
- `tts.jobs.create` and `tts.jobs.retrieve` let you poll on your own terms.
- **Download a job's audio promptly.** The server keeps it for 24 hours after the job finishes; after that, `tts.jobs.audio` raises `GoneError`, code `audio_expired`.
- A poll that fails on a connection error, a timeout, a 429 or a 500, 502, 503 or 504 is tried again at the next interval until the deadline. Any other error raises at once.
- **Pass your own `idempotency_key`.** If the wait raises, calling `create_and_wait` again with the same key and text picks up the same job instead of queuing and billing a second one: a known key answers with the job it created, whatever its state, and is released 24 hours after the job finishes.

## Uploads

`voices.create` and `voices.replace_audio` take the reference clip as `ref_audio`, and `stt.transcribe` takes the audio as `file`. A file is any of these:

```python
from pathlib import Path

voice = client.voices.create(
    name="Office voice",
    language="uz",
    ref_audio=Path("sample.wav"),  # a path, as a Path or a str
    ref_text="Salom, men sizga yordam beraman.",
    tags=["support", "calm"],
)

recording = Path("call.mp3").read_bytes()
transcription = client.stt.transcribe(file=("call.mp3", recording), language="uz")  # bytes with a filename
print(transcription.text, transcription.duration_seconds)

with open("call.mp3", "rb") as file:  # a binary file object with a name
    transcription = client.stt.transcribe(file=file, language="uz")
```

- Bytes need a filename: the SDK refuses bare bytes, and a file object without a name, before anything is sent. Pass `("clip.wav", data)`.
- The file's content type is the one you give in a three-part tuple, `("clip.wav", data, "audio/wav")`, else the one its extension names: `wav` → `audio/wav`, `mp3` → `audio/mpeg`, `ogg` → `audio/ogg`, `flac` → `audio/flac`, `m4a` → `audio/mp4`, `webm` → `audio/webm`, and anything else `application/octet-stream`. The server checks the file itself, so the declared type never decides whether it is accepted.
- The file is read whole before the first attempt, so a retry sends the same bytes; a file object is read from its start.
- A list such as `tags` goes as repeated `tags[]` fields.

## Chat completions and streaming

With `stream=True`, `chat.completions.create` returns a `Stream` once the answer starts. Loop over it for each `ChatCompletionChunk`:

```python
with client.chat.completions.create(
    model="gemma-4-26b-a4b",
    messages=[{"role": "user", "content": "Toshkent haqida qisqacha gapirib ber."}],
    stream=True,
) as stream:
    for chunk in stream:
        if chunk.choices:
            print(chunk.choices[0].delta.content or "", end="")
        if chunk.usage is not None:
            print(f"\n{chunk.usage.total_tokens} tokens")
```

With `AsyncNeuronAI`, await the call, then use `async with` and `async for`.

- The stream ends at the server's `[DONE]`. The last chunk before it carries `usage` when the model reports its token counts.
- Leaving the loop early (`break`, `return` or an error), calling `stream.close()`, or leaving the `with` block before the end aborts the request, and the server stops generating.
- **Read every stream you open, or close it:** until then it holds its connection. A `with` block does both.
- The timeout bounds the wait for each piece of the answer, not the whole of it, so a long answer isn't cut off at 5 minutes; a silence longer than that raises `APITimeoutError`.
- If the model fails once the stream has started, the loop raises an `APIError` with status 200 and code `upstream_error`. A stream that ends without `[DONE]` raises `APIConnectionError`: the answer may be cut short.
- A stream can be read once: a second loop over it raises `NeuronAIError`.
- A streamed call is billed when it ends, so it has no `cost`. It is retried like any chat completion before it starts, and never once it has.

Without `stream`, the result is the `ChatCompletion` body, with `cost` from the `X-Cost` header.

## Embeddings and rerank

```python
embeddings = client.embeddings.create(model="bge-m3", input=["Salom", "Rahmat"])
print(len(embeddings.data[0].embedding), embeddings.cost)

ranked = client.rerank.create(
    model="bge-reranker-v2-m3", query="ob-havo", documents=["Bugun quyoshli.", "Narxlar oshdi."], top_n=1
)
print(ranked.results[0].index, ranked.results[0].relevance_score)
```

Embeddings are float vectors. Rerank's `results` keep the server's order: by `relevance_score`, highest first. Chat completions, models, embeddings and rerank return the API's own bodies, compatible with OpenAI's and Cohere's shapes, with `cost` attached from `X-Cost` when the answer sends it.

## Lists and pages

`voices.list` and `api_keys.list` return a `Page`: its `data`, its `next_cursor`, `has_next_page()` and `next_page()`. Loop over it to walk every item, fetching the pages as it goes:

```python
for voice in client.voices.list(type="custom", limit=50):
    print(voice.id, voice.name)

page = client.api_keys.list(limit=10)
if page.has_next_page():
    print(len(page.next_page().data))
```

On `AsyncNeuronAI`, a list method returns an `AsyncPaginator`: `await` it for the first page, or loop over it with `async for` for every item. Pass `limit` from 1 to 100. Cursors are opaque: pass a page's `next_cursor` back as `cursor`, and never build one.

## Results, request IDs and raw responses

Results are pydantic models. An answer in the `{data, request_id}` envelope gives its `data`, with a read-only `request_id`: quote it to support. On the compatible endpoints, `cost` is attached the same way. **Neither is a field**, so `model_dump()` and `model_dump_json()` leave them out, and two results compare by what the API sent: read them from the result itself.

A field the SDK doesn't know yet is kept: `model_dump()` includes it, and `model_extra` holds it. An enum field takes a value added later as a plain string.

Each resource's `with_raw_response` has the same methods, returning the result together with the answer's status and headers:

```python
raw = client.tts.jobs.with_raw_response.create(text="Salom")
print(raw.status, raw.headers.get("x-request-id"), raw.data.id)
```

## Errors

Everything the SDK raises is a `NeuronAIError`:

- `APIConnectionError`: the API couldn't be reached, or the connection dropped. `APITimeoutError` extends it.
- `APIError`: the API answered with an error. It carries `status`, `type`, `code`, `message`, `param`, `fields` (each invalid field and its first message, on a validation error), `request_id` and `headers`. Each status has its own class:

| Status | Class |
|---|---|
| 400 | `BadRequestError` |
| 401 | `AuthenticationError` |
| 402 | `InsufficientQuotaError` |
| 403 | `PermissionDeniedError` |
| 404 | `NotFoundError` |
| 409 | `ConflictError` |
| 410 | `GoneError` |
| 413 | `PayloadTooLargeError` |
| 415 | `UnsupportedMediaTypeError` |
| 422 | `UnprocessableEntityError` |
| 429 | `RateLimitError`, with `retry_after` in seconds |
| 500 and above | `InternalServerError` |
| any other | `APIError` |

- `WaitTimeoutError`: `create_and_wait` ran out of time; `job` is the job as last seen.

**Match on `code`, never on `message`.** The codes are stable; the messages are written for people and may change. `ErrorCode` lists every code, and `code` stays a plain string, so a code added later still arrives:

```python
from naiuz import ErrorCode, InsufficientQuotaError, RateLimitError

try:
    client.tts.synthesize(text="Salom", voice_id="kamron")
except InsufficientQuotaError as error:
    if error.code == ErrorCode.INSUFFICIENT_BALANCE:
        print("Top up your balance.")
except RateLimitError as error:
    print(f"Try again in {error.retry_after or 1} s.")
```

An answer outside the API's envelope, such as a proxy's HTML page, still raises the class for its status; its `code` and `type` are None, and its `message` is the status text and the start of the body.

## Timeouts, retries and cancelling

- **The timeout is per attempt:** 5 minutes by default, reading the answer included. Set it on the client, or per call with `timeout=`. Retries and their waits come on top, so a call can take up to `(max_retries + 1) × timeout` plus the waits.
- **Long voice operations need a longer timeout.** Most calls finish well inside 5 minutes, but a long dialogue can take about four and a half, and `voices.update` or `voices.replace_audio` re-creating a voice can take about ten. Pass one for those: `client.voices.replace_audio(voice_id, ref_audio=path, timeout=15 * 60)`.
- **A connection that goes silent.** The async client on Python 3.11 and newer ends an attempt at its timeout, wherever it waits. The sync client, and the async one on Python 3.10, can't interrupt a read that is waiting: they drop a connection that stays silent for the timeout, and stop reading an answer once its time is up, so an attempt can run to about twice its timeout. That bound doesn't cover an answer's headers arriving a byte at a time, or an upload the server reads a byte at a time, since each byte restarts httpx's own timer. Use the async client on Python 3.11 or newer where a hard deadline matters.
- **Retries:** a failed attempt is retried up to `max_retries` times, waiting 0.5 s, then 1 s, 2 s and so on, plus up to 25% jitter, at most 8 s. When the server sends `Retry-After`, that wait replaces it, up to 60 s; a longer one fails the call at once, and a 429's error carries `retry_after`.
- **What is retried** depends on the call, so a retry never charges twice:
  - every call: a 429, and a connection that was never made;
  - reads, deletes, `api_keys.update` and `api_keys.revoke`: also a 500, 502, 503 or 504, and a timeout or reset after sending;
  - `tts.synthesize`, `tts.dialogue`, `tts.jobs.create`, `stt.transcribe` and `voices.create`: also any 5xx, a timeout and a reset. They send an `Idempotency-Key` (yours, from `idempotency_key=`, or a generated one), the same on every retry, so the server never does the work twice;
  - chat completions, embeddings, rerank, `voices.update` and `voices.replace_audio`: also a 5xx in the API's own error envelope, but not a proxy's bare 5xx, and not a timeout or reset after sending, since the call may have completed or still be running;
  - `api_keys.create`: nothing more, since a retry could create a second key.
- **Cancelling:** the async client runs on asyncio. Cancel the task that awaits a call, or use `asyncio.timeout` or `asyncio.wait_for`, and the call stops at once, its answer closed, and is not retried. On the sync client, Ctrl+C (`KeyboardInterrupt`) does the same; `timeout` and `max_retries` bound a call otherwise.

## Per-call options

Every method takes these keyword arguments besides its own:

| Option | |
|---|---|
| `timeout` | seconds this call's attempts may take |
| `max_retries` | retries for this call |
| `extra_headers` | headers for this call, over the client's |
| `idempotency_key` | the five idempotent calls only: the `Idempotency-Key` to send, at most 191 characters |

Headers go on in this order, each over the ones before: the SDK's own, `default_headers`, the call's Idempotency-Key, then `extra_headers`.

**Left out, or None.** An optional field defaults to `NOT_GIVEN`, and a field you don't pass isn't sent. None sends JSON null, which the API reads as "clear it": `client.voices.update(voice_id, ref_text=None)` removes the transcript, while `client.voices.update(voice_id, name="Support voice")` leaves it alone. In a multipart upload, None is left out like `NOT_GIVEN`, since a form has no null.

## Types

Every request parameter and response field is typed, with its description from the API document, and the package ships `py.typed`. A parameter that takes a fixed set of values is a `Literal`, so a type checker catches a typo; a result's enum field is `Literal[...] | str`, so a value the API adds later still arrives. Each request body also comes as a `TypedDict` in `naiuz.types`, such as `SynthesizeSpeechRequest` or `CreateVoiceRequest`, to build and pass as `**params`.

## Examples

[examples/](https://github.com/naiuz/sdk/tree/main/python/examples) holds eight programs: synthesizing to a file, a dialogue, an async job with waiting, cloning a voice, a transcription, streaming chat (with the async client), embeddings with rerank, and managing API keys. Each reads its key from `NEURONAI_API_KEY`. To run one from this folder, run `uv run python examples/synthesize.py`.

## License

MIT
