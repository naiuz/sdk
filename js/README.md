# NeuronAI TypeScript SDK

The official TypeScript and JavaScript client for the NeuronAI API: speech synthesis and dialogue, voice cloning, transcription, chat completions, embeddings and rerank. It has no dependencies, and runs on Node 20 or newer, Bun, Deno and Cloudflare Workers.

## Install

```bash
npm install @naiuz/sdk
```

With Bun, run `bun add @naiuz/sdk`. With Deno, import from `npm:@naiuz/sdk`.

## Quickstart

Create an API key in your NeuronAI dashboard at https://my.neuronai.uz and put it in the `NEURONAI_API_KEY` environment variable.

```ts
import {NeuronAI} from "@naiuz/sdk";

const client = new NeuronAI();

const speech = await client.tts.synthesize({text: "Assalomu alaykum!", voice_id: "kamron", language: "uz"});
await speech.save("salom.wav");
console.log(`${String(speech.character_count)} characters, ${String(speech.cost)} UZS`);

const answer = await client.chat.completions.create({
    model: "gemma-4-26b-a4b",
    messages: [{role: "user", content: "Salom! Bugun ob-havo qanday?"}],
});
console.log(answer.choices[0]?.message.content);
```

The package has named exports only, in ESM and CommonJS builds with their types. A method never throws synchronously: its errors arrive as rejections.

## The client

```ts
const client = new NeuronAI({
    apiKey: "nai_...", // else NEURONAI_API_KEY
    baseURL: "https://my.neuronai.uz/api/v1", // else NEURONAI_BASE_URL, else this address
    timeout: 300_000, // milliseconds each attempt may take: 5 minutes by default
    maxRetries: 2, // retries of a failed attempt: 2 by default
    defaultHeaders: {"x-app": "shop"}, // sent with every call
});
```

- A client without a key fails at construction with `NeuronAIError`, never on the first call. The key is trimmed, and a key with a space or a line break inside is refused.
- The key never appears in an error, in a log, or when the client is printed.
- `fetch` swaps in your own fetch implementation, for tests and proxies.
- In a browser page, the constructor throws: the key would be exposed to anyone who opens the page. Call the API from your server. Pass `dangerouslyAllowBrowser: true` only if you accept that risk.

## What's in it

| Resource | Methods |
|---|---|
| `client.tts` | `synthesize`, `dialogue` |
| `client.tts.jobs` | `create`, `retrieve`, `audio`, `createAndWait` |
| `client.voices` | `list`, `retrieve`, `create`, `update`, `replaceAudio`, `delete` |
| `client.stt` | `transcribe` |
| `client.chat.completions` | `create`, streamed or not |
| `client.models` | `list` |
| `client.embeddings` | `create` |
| `client.rerank` | `create` |
| `client.account` | `balance`, `usage` |
| `client.apiKeys` | `list`, `create`, `retrieve`, `update`, `revoke` |

[api.md](api.md) lists every method with its parameters and what it returns. Request and response fields keep the API's own snake_case names, such as `voice_id` and `next_cursor`; methods are camelCase.

## Speech

`tts.synthesize` resolves to a `SpeechAudio`: the WAV file's bytes, and what the answer's headers say about them.

```ts
const speech = await client.tts.synthesize({text: "Xush kelibsiz!", voice_id: "kamron", quality: "high"});
speech.audio; // Uint8Array: the WAV file
speech.content_type; // "audio/wav"
speech.cost; // the price billed, in UZS (X-Cost)
speech.character_count; // the characters billed (X-Character-Count); an emotion tag counts as one
speech.balance; // your balance after the charge (X-Balance)
speech.voice_custom; // whether the voice is one of your clones (X-Voice-Custom)
speech.latency_ms; // how long the voice took (X-Latency-Ms)
speech.replayed; // whether this answer replays an earlier call with the same Idempotency-Key
speech.request_id; // the request's ID (X-Request-Id), to quote to support
await speech.save("welcome.wav");
```

The number fields are `null` when the answer lacks their header. `save(path)` works on Node, Bun and Deno (with `--allow-write`). Elsewhere, such as in a browser, it rejects with `NeuronAIError`: use the bytes in `audio` instead.

`tts.dialogue` renders a multi-speaker script into one WAV and resolves to a `DialogueAudio`, which adds where each turn sits in the audio:

```ts
const dialogue = await client.tts.dialogue({
    turns: [
        {voice_id: "voice-a", text: "Assalomu alaykum!"},
        {voice_id: "voice-b", text: "Va alaykum assalom!"},
    ],
    gap_ms: 300,
});
for (const turn of dialogue.turns) console.log(turn.index, turn.voice_id, turn.start_s, turn.end_s);
console.log(dialogue.turn_count);
```

## Synthesis jobs

For a long text, queue a job instead of waiting on one call. `tts.jobs.createAndWait` creates the job, polls it every 2 seconds, and resolves once it has `succeeded` or `failed`:

```ts
import {WaitTimeoutError} from "@naiuz/sdk";

try {
    const job = await client.tts.jobs.createAndWait({text: longText, voice_id: "kamron"}, {pollInterval: 2000, timeout: 600_000});
    if (job.status === "succeeded") await (await client.tts.jobs.audio(job.id)).save("chapter.wav");
    else console.error(job.error?.code, job.error?.message);
} catch (error) {
    // The wait ran out first: the job may still finish, so fetch its audio later.
    if (error instanceof WaitTimeoutError) console.log(`Still ${error.job.status}: ${error.job.id}`);
    else throw error;
}
```

- `timeout` counts from when the job is created: 10 minutes by default. A poll still in flight when it runs out is abandoned.
- `tts.jobs.create` and `tts.jobs.retrieve` let you poll on your own terms.
- **Download a job's audio promptly.** The server keeps it for 24 hours after the job finishes; after that, `tts.jobs.audio` rejects with `GoneError`, code `audio_expired`.
- A poll that fails on a connection error, a timeout, a 429 or a 500, 502, 503 or 504 is tried again at the next interval until the deadline. Any other error rejects the wait at once.
- Pass your own `idempotencyKey`. If the wait rejects, calling `createAndWait` again with the same key and parameters picks up the same job instead of queuing and billing a second one: a known key answers 200 with the job it created, whatever its state, and is released 24 hours after the job finishes.

## Uploads

`voices.create` and `voices.replaceAudio` take the reference clip as `ref_audio`, and `stt.transcribe` takes the audio as `file`. A file is a `File`, or bytes with a filename:

```ts
import {readFile} from "node:fs/promises";

const voice = await client.voices.create({
    name: "Office voice",
    language: "uz",
    ref_audio: {data: await readFile("sample.wav"), filename: "sample.wav"},
    ref_text: "Salom, men sizga yordam beraman.",
    tags: ["support", "calm"],
});

const transcription = await client.stt.transcribe({file: {data: bytes, filename: "call.mp3"}, language: "uz"});
console.log(transcription.text, transcription.duration_seconds);
```

- `data` is a `Uint8Array` (a Node `Buffer` is one) or a `Blob`. Raw bytes need a filename: the SDK refuses them without one, and refuses a path given as a string.
- The file's content type is `contentType` when you give it (`{data, filename, contentType: "audio/wav"}`), else the Blob's own type, else the one its extension names: `wav` → `audio/wav`, `mp3` → `audio/mpeg`, `ogg` → `audio/ogg`, `flac` → `audio/flac`, `m4a` → `audio/mp4`, `webm` → `audio/webm`, and anything else `application/octet-stream`. The server checks the file itself, so the declared type never decides whether it is accepted.
- A list such as `tags` goes as repeated `tags[]` fields.

## Chat completions and streaming

With `stream: true`, `chat.completions.create` resolves to a `Stream` once the answer starts. Loop over it for each `ChatCompletionChunk`:

```ts
const stream = await client.chat.completions.create({
    model: "gemma-4-26b-a4b",
    messages: [{role: "user", content: "Toshkent haqida qisqacha gapirib ber."}],
    stream: true,
});
for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta.content ?? "");
    if (chunk.usage) console.log(`\n${String(chunk.usage.total_tokens)} tokens`);
}
```

- The stream ends at the server's `[DONE]`. The last chunk before it carries `usage` when the model reports its token counts.
- Leaving the loop early (`break`, `return` or an error) or calling `stream.close()` aborts the request, and the server stops generating.
- The timeout bounds the wait for each piece of the answer, not the whole of it, so a long answer isn't cut off at 5 minutes; a silence longer than that throws `APITimeoutError`.
- If the model fails once the stream has started, the loop throws an `APIError` with status 200 and code `upstream_error`. A stream that ends without `[DONE]` throws `APIConnectionError`: the answer may be cut short.
- A stream can be read once. `stream.toReadableStream()` gives it as bytes of newline-delimited JSON, one chunk per line, to pass on as the body of your own `Response`.
- A streamed call is billed when it ends, so it has no `cost`. It is retried like any chat completion before it starts, and never once it has.

Without `stream`, the result is the `ChatCompletion` body, with `cost` from the `X-Cost` header.

## Embeddings and rerank

```ts
const embeddings = await client.embeddings.create({model: "bge-m3", input: ["Salom", "Rahmat"]});
console.log(embeddings.data[0]?.embedding.length, embeddings.cost);

const ranked = await client.rerank.create({model: "bge-reranker-v2-m3", query: "ob-havo", documents: ["Bugun quyoshli.", "Narxlar oshdi."], top_n: 1});
console.log(ranked.results[0]?.index, ranked.results[0]?.relevance_score);
```

Embeddings are float vectors. Rerank's `results` keep the server's order: by `relevance_score`, highest first. Chat completions, models, embeddings and rerank return the API's own bodies, compatible with OpenAI's and Cohere's shapes, with `cost` attached from `X-Cost` when the answer sends it.

## Lists and pages

`voices.list` and `apiKeys.list` resolve to a `Page`: its `data`, its `next_cursor`, `hasNextPage()` and `nextPage()`. Loop over the call with `for await` to walk every item, fetching the pages as it goes:

```ts
for await (const voice of client.voices.list({type: "custom", limit: 50})) console.log(voice.id, voice.name);

const page = await client.apiKeys.list({limit: 10});
if (page.hasNextPage()) {
    const next = await page.nextPage();
    console.log(next.data.length);
}
```

Pass `limit` from 1 to 100. Cursors are opaque: pass a page's `next_cursor` back as `cursor`, and never build one.

## Results, request IDs and raw responses

An answer in the `{data, request_id}` envelope resolves to its `data`, with `request_id` attached: quote it to support. On the compatible endpoints, `cost` is attached the same way. Both are non-enumerable, so a result serializes and compares exactly as the API sent it. **Spreading a result (`{...voice}`) or serializing it drops `request_id` and `cost`**: read them from the result itself.

Every method's promise also has `withResponse()`, which resolves to the result together with the answer's status and headers:

```ts
const {data: job, status, headers} = await client.tts.jobs.create({text: "Salom"}).withResponse();
console.log(status, headers.get("location"), job.id);
```

## Errors

Everything the SDK throws is a `NeuronAIError`:

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

- `WaitTimeoutError`: `createAndWait` ran out of time; `job` is the job as last seen.

**Match on `code`, never on `message`.** The codes are stable; the messages are written for people and may change. `ErrorCode` lists every code, and `code` stays a plain string, so a code added later still arrives:

```ts
import {ErrorCode, InsufficientQuotaError, RateLimitError} from "@naiuz/sdk";

try {
    await client.tts.synthesize({text: "Salom", voice_id: "kamron"});
} catch (error) {
    if (error instanceof InsufficientQuotaError && error.code === ErrorCode.InsufficientBalance) console.log("Top up your balance.");
    else if (error instanceof RateLimitError) console.log(`Try again in ${String(error.retry_after ?? 1)} s.`);
    else throw error;
}
```

An answer outside the API's envelope, such as a proxy's HTML page, still raises the class for its status; its `code` and `type` are `null`, and its `message` is the status text and the start of the body.

## Timeouts, retries and cancelling

- **The timeout is per attempt:** 5 minutes by default, reading the answer included. Set it on the client, or per call with `{timeout}`. Retries and their waits come on top, so a call can take up to `(maxRetries + 1) × timeout` plus the waits.
- **Long voice operations need a longer timeout.** Most calls finish well inside 5 minutes, but a long dialogue can take about four and a half, and `voices.update` or `voices.replaceAudio` re-creating a voice can take about ten. Pass one for those: `client.voices.replaceAudio(id, params, {timeout: 15 * 60_000})`.
- **Retries:** a failed attempt is retried up to `maxRetries` times, waiting 0.5 s, then 1 s, 2 s and so on, plus up to 25% jitter, at most 8 s. When the server sends `Retry-After`, that wait replaces it, up to 60 s; a longer one fails the call at once, and a 429's error carries `retry_after`.
- **What is retried** depends on the call, so a retry never charges twice:
  - every call: a 429, and a connection that was never made;
  - reads, deletes, `apiKeys.update` and `apiKeys.revoke`: also a 500, 502, 503 or 504, and a timeout or reset after sending;
  - `tts.synthesize`, `tts.dialogue`, `tts.jobs.create`, `stt.transcribe` and `voices.create`: also any 5xx, a timeout and a reset. They send an `Idempotency-Key` (yours, from `{idempotencyKey}`, or a generated one), the same on every retry, so the server never does the work twice;
  - chat completions, embeddings, rerank, `voices.update` and `voices.replaceAudio`: also a 5xx in the API's own error envelope, but not a proxy's bare 5xx, and not a timeout or reset after sending, since the call may have completed or still be running;
  - `apiKeys.create`: nothing more, since a retry could create a second key.
- **Cancelling:** pass `{signal}`, an `AbortSignal`. Aborting stops the attempt, or the wait between attempts, at once; the call rejects with the signal's reason and is not retried.

## Per-call options

Every method takes an options object last:

| Option | |
|---|---|
| `timeout` | milliseconds this call's attempts may take |
| `maxRetries` | retries for this call |
| `extraHeaders` | headers for this call, over the client's |
| `signal` | an `AbortSignal` that cancels the call |
| `idempotencyKey` | the five idempotent calls only: the `Idempotency-Key` to send, at most 191 characters |

Headers go on in this order, each over the ones before: the SDK's own, `defaultHeaders`, the call's Idempotency-Key, then `extraHeaders`.

## Types

Every request parameter and response field is typed, with its description from the API document. A string enum is an open union, such as `"queued" | "running" | "succeeded" | "failed" | (string & {})`, so a value the API adds later still type-checks, and a field the API adds later passes through untouched.

## Examples

[examples/](examples) holds eight programs: synthesizing to a file, a dialogue, an async job with waiting, cloning a voice, a transcription, streaming chat, embeddings with rerank, and managing API keys. Each reads its key from `NEURONAI_API_KEY`. To run one from this folder, build the package with `npm run build`, then run the file with a runtime that runs TypeScript, such as `node examples/synthesize.ts` on Node 23.6 or newer, or `bun examples/synthesize.ts`.

## License

MIT
