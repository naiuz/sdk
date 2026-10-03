# NeuronAI PHP SDK

The official PHP client for the NeuronAI API: speech synthesis and dialogue, voice cloning, transcription, chat completions, embeddings and rerank. It runs on PHP 8.2 to 8.5, sends its calls through any PSR-18 HTTP client, such as Guzzle or Symfony HttpClient, and depends only on the PSR interfaces and php-http/discovery.

## Install

```bash
composer require naiuz/sdk
```

The SDK needs an HTTP client. If your project has none yet, add Guzzle: `composer require guzzlehttp/guzzle`.

## Quickstart

Create an API key in your NeuronAI dashboard at https://my.neuronai.uz and put it in the `NEURONAI_API_KEY` environment variable.

```php
use Naiuz\NeuronAI;

$client = new NeuronAI();

$speech = $client->tts->synthesize(['text' => 'Assalomu alaykum!', 'voice_id' => 'kamron', 'language' => 'uz']);
$speech->save('salom.wav');
echo "{$speech->character_count} characters, {$speech->cost} UZS\n";

$answer = $client->chat->completions->create([
    'model' => 'gemma-4-26b-a4b',
    'messages' => [['role' => 'user', 'content' => 'Salom! Bugun ob-havo qanday?']],
]);
echo $answer->choices[0]->message->content;
```

## The client

```php
use Naiuz\NeuronAI;

$client = new NeuronAI([
    'api_key' => 'nai_...', // else NEURONAI_API_KEY
    'base_url' => 'https://my.neuronai.uz/api/v1', // else NEURONAI_BASE_URL, else this address
    'timeout' => 300, // seconds each attempt may take: 5 minutes by default
    'max_retries' => 2, // retries of a failed attempt: 2 by default
    'default_headers' => ['x-app' => 'shop'], // sent with every call
]);
```

- A client without a key throws `NeuronAIException` at construction, never on the first call. The key is trimmed, and a key with a space or a line break inside is refused. The environment is read from `$_SERVER`, `$_ENV`, then `getenv()`, whichever your `.env` loader filled.
- The key never appears in an exception, in a log, or when the client is dumped, and a client can't be serialized.
- An option the client doesn't take, such as `apiKey`, is refused, rather than ignored.
- `http_client` takes your own PSR-18 client, for proxies and tests. Without one, the SDK makes Guzzle when it is installed, else Symfony HttpClient, else the client php-http/discovery finds.

## What's in it

| Resource | Methods |
|---|---|
| `$client->tts` | `synthesize`, `dialogue` |
| `$client->tts->jobs` | `create`, `retrieve`, `audio`, `createAndWait` |
| `$client->voices` | `list`, `retrieve`, `create`, `update`, `replaceAudio`, `delete` |
| `$client->stt` | `transcribe` |
| `$client->chat->completions` | `create`, streamed or not |
| `$client->models` | `list` |
| `$client->embeddings` | `create` |
| `$client->rerank` | `create` |
| `$client->account` | `balance`, `usage` |
| `$client->apiKeys` | `list`, `create`, `retrieve`, `update`, `revoke` |

[api.md](https://github.com/naiuz/sdk/blob/main/php/api.md) lists every method with its parameters and what it returns. Methods are camelCase. Request fields are array keys, and result fields are properties, under the API's own names, such as `voice_id` and `next_cursor`.

## Speech

`tts->synthesize` returns a `SpeechAudio`: the WAV file's bytes, and what the answer's headers say about them.

```php
$speech = $client->tts->synthesize(['text' => 'Xush kelibsiz!', 'voice_id' => 'kamron', 'quality' => 'high']);
$speech->save('welcome.wav');
```

| Property | |
|---|---|
| `audio` | `string`: the WAV file's bytes |
| `content_type` | `'audio/wav'` |
| `cost` | the price billed, in UZS (`X-Cost`) |
| `character_count` | the characters billed (`X-Character-Count`); an emotion tag counts as one |
| `balance` | your balance after the charge (`X-Balance`) |
| `voice_custom` | whether the voice is one of your clones (`X-Voice-Custom`) |
| `latency_ms` | how long the voice took (`X-Latency-Ms`) |
| `replayed` | whether this answer replays an earlier call with the same Idempotency-Key |
| `request_id` | the request's ID (`X-Request-Id`), to quote to support |

The number properties are null when the answer lacks their header. `save($path)` writes the file, replacing one already there; it throws `NeuronAIException` naming the path when it can't, never a PHP warning, even where an error handler turns warnings into exceptions. `var_dump()` shows the audio's size rather than its bytes.

`tts->dialogue` renders a multi-speaker script into one WAV and returns a `DialogueAudio`, which adds where each turn sits in the audio:

```php
$dialogue = $client->tts->dialogue([
    'turns' => [
        ['voice_id' => 'voice-a', 'text' => 'Assalomu alaykum!'],
        ['voice_id' => 'voice-b', 'text' => 'Va alaykum assalom!'],
    ],
    'gap_ms' => 300,
]);
foreach ($dialogue->turns as $turn) {
    echo "{$turn->index} {$turn->voice_id} {$turn->start_s} {$turn->end_s}\n";
}
echo $dialogue->turn_count;
```

## Synthesis jobs

For a long text, queue a job instead of waiting on one call. `tts->jobs->createAndWait` creates the job, polls it every 2 seconds, and returns it once it has `succeeded` or `failed`:

```php
use Naiuz\Exceptions\WaitTimeoutException;

$longText = str_repeat("Bir bor ekan, bir yo'q ekan. ", 100);
try {
    $job = $client->tts->jobs->createAndWait(
        ['text' => $longText, 'voice_id' => 'kamron'],
        ['idempotency_key' => 'chapter-7', 'poll_interval' => 2, 'timeout' => 600],
    );
    if ($job->status === 'succeeded') {
        $client->tts->jobs->audio($job->id)->save('chapter.wav');
    } elseif ($job->error !== null) {
        echo "{$job->error->code}: {$job->error->message}\n";
    }
} catch (WaitTimeoutException $error) {
    // The wait ran out first: the job may still finish, so fetch its audio later.
    echo "Still {$error->job->status}: {$error->job->id}\n";
}
```

- `timeout` counts from when the job is created: 10 minutes by default. Each poll keeps the client's own timeout, cut to the time left, so a poll still waiting at the deadline ends about then on Guzzle or Symfony HttpClient.
- `tts->jobs->create` and `tts->jobs->retrieve` let you poll on your own terms. Compare a job's `status` with `TtsJobStatus` cases' values.
- **Download a job's audio promptly.** The server keeps it for 24 hours after the job finishes; after that, `tts->jobs->audio` throws `GoneException`, code `audio_expired`.
- A poll that fails on a connection error, a timeout, a 429 or a 500, 502, 503 or 504 is tried again at the next interval until the deadline. Any other exception is thrown at once.
- **Pass your own `idempotency_key`.** If the wait throws, calling `createAndWait` again with the same key and text picks up the same job instead of queuing and billing a second one: a known key answers with the job it created, whatever its state, and is released 24 hours after the job finishes.

## Uploads

`voices->create` and `voices->replaceAudio` take the reference clip as `ref_audio`, and `stt->transcribe` takes the audio as `file`. A file is either of these:

```php
$voice = $client->voices->create([
    'name' => 'Office voice',
    'language' => 'uz',
    'ref_audio' => 'sample.wav', // a path
    'ref_text' => 'Salom, men sizga yordam beraman.',
    'tags' => ['support', 'calm'],
]);

$stream = fopen('call.mp3', 'rb');
if ($stream === false) {
    exit("call.mp3 can't be opened.\n");
}
$transcription = $client->stt->transcribe([
    'file' => ['stream' => $stream, 'filename' => 'call.mp3'], // a stream, with the filename to send it under
    'language' => 'uz',
]);
echo "{$transcription->text} ({$transcription->duration_seconds} s)\n";
```

- **A stream needs a filename**, since the filename's extension names the file's format: the SDK refuses a stream alone, or one with an empty filename, before anything is sent.
- **A string is a path.** To upload bytes you hold, such as a synthesized clip's `audio`, write them to a stream first, and pass it with a filename: `$stream = fopen('php://temp', 'w+b'); fwrite($stream, $speech->audio);`. A stream is read from its start, so there's no need to rewind it, and one that can't seek must not have been read from.
- The file's content type is the one you give as `'content_type' => 'audio/wav'` beside a stream, else the one its extension names: `wav` → `audio/wav`, `mp3` → `audio/mpeg`, `ogg` → `audio/ogg`, `flac` → `audio/flac`, `m4a` → `audio/mp4`, `webm` → `audio/webm`, and anything else `application/octet-stream`. The server checks the file itself, so the declared type never decides whether it is accepted.
- The file is read whole before the first attempt, so a retry sends the same bytes: an upload holds about its own size in memory, and twice that while the form is built. The API takes a transcription's file up to 25 MB, and a voice's clip up to 10 MB.
- A list such as `tags` goes as repeated `tags[]` fields, and each line break in a text field, such as a multi-line `ref_text`, goes as CRLF, as an HTML form sends it.

## Chat completions and streaming

With `'stream' => true`, `chat->completions->create` returns a `Stream` once the answer starts. Loop over it for each `ChatCompletionChunk`:

```php
$stream = $client->chat->completions->create([
    'model' => 'gemma-4-26b-a4b',
    'messages' => [['role' => 'user', 'content' => 'Toshkent haqida qisqacha gapirib ber.']],
    'stream' => true,
]);
foreach ($stream as $chunk) {
    echo $chunk->choices[0]->delta->content ?? '';
    if ($chunk->usage !== null) {
        echo "\n{$chunk->usage->total_tokens} tokens\n";
    }
}
```

- The stream ends at the server's `[DONE]`. The last chunk before it carries `usage` when the model reports its token counts. Its last chunk has no choices, so read `$chunk->choices[0]` with `??`.
- **Leaving the loop early** (`break`, `return` or an exception) closes the request at once, and the server stops generating, even if you keep `$stream` around. `$stream->close()` does the same.
- **Read every stream you open, or close it.** A stream you never loop over holds its connection until you close it or drop it.
- The timeout bounds the wait for each piece of the answer, not the whole of it, so a long answer isn't cut off at 5 minutes; a silence longer than that throws `APITimeoutException`.
- If the model fails once the stream has started, the loop throws an `APIException` with status 200 and code `upstream_error`. A stream that ends without `[DONE]` throws `APIConnectionException`: the answer may be cut short.
- A stream can be read once: a second loop over it throws `NeuronAIException`.
- A streamed call is billed when it ends, so it has no `cost`. It is retried like any chat completion before it starts, and never once it has.
- **Guzzle streams through its default handler stack, and only with PHP's `allow_url_fopen` on**, as it is by default. Without it, Guzzle would read the whole answer before handing it over, so the SDK refuses the stream before anything is sent. A Guzzle client you build on `CurlHandler` alone reads the whole answer too, which the SDK can't see, and its timeout then bounds the whole stream. For either, pass Symfony HttpClient's `Psr18Client` as `http_client` instead.
- PHP has no overloads, so `create` declares its result as `ChatCompletion|Stream`. PHPStan reads its conditional type: `'stream' => true` gives `Stream<ChatCompletionChunk>`, and no `stream`, or `false` or null, gives `ChatCompletion`.

Without `stream`, the result is the `ChatCompletion` body, with `cost` from the `X-Cost` header.

## Embeddings and rerank

```php
$embeddings = $client->embeddings->create(['model' => 'bge-m3', 'input' => ['Salom', 'Rahmat']]);
echo count($embeddings->data[0]->embedding), " dimensions, {$embeddings->cost} UZS\n";

$ranked = $client->rerank->create(['model' => 'bge-reranker-v2-m3', 'query' => 'ob-havo', 'documents' => ['Bugun quyoshli.', 'Narxlar oshdi.'], 'top_n' => 1]);
echo "{$ranked->results[0]->index} {$ranked->results[0]->relevance_score}\n";
```

Embeddings are float vectors. Rerank's `results` keep the server's order: by `relevance_score`, highest first. Chat completions, models, embeddings and rerank return the API's own bodies, compatible with OpenAI's and Cohere's shapes, with `cost` attached from `X-Cost` when the answer sends it.

## Lists and pages

`voices->list` and `apiKeys->list` return a `Page`: its `data`, its `next_cursor`, `hasNextPage()` and `nextPage()`. Loop over it with `foreach` to walk every item, fetching the pages as it goes:

```php
foreach ($client->voices->list(['type' => 'custom', 'limit' => 50]) as $voice) {
    echo "{$voice->id} {$voice->name}\n";
}

$page = $client->apiKeys->list(['limit' => 10]);
if ($page->hasNextPage()) {
    echo count($page->nextPage()->data), "\n";
}
```

Pass `limit` from 1 to 100. Cursors are opaque: pass a page's `next_cursor` back as `cursor`, and never build one.

## Results, request IDs and raw responses

Results are `readonly` classes with typed properties, under the API's own names. An answer in the `{data, request_id}` envelope gives its `data`, with a `request_id` property: quote it to support. On the compatible endpoints, `cost` is attached the same way. **Neither is a field of the body**, so `toArray()` and `json_encode()` leave them out and give exactly what the API sent: read them from the result itself.

A field the SDK doesn't know yet is kept: `toArray()` and `json_encode()` include it. An enum field is a plain string, so a value the API adds later still arrives; compare it with an enum case's value, such as `TtsJobStatus::Succeeded->value`.

`$client->withRawResponse()` has the same resources and methods, each returning the result together with the answer's status and headers:

```php
$raw = $client->withRawResponse()->tts->jobs->create(['text' => 'Salom']);
echo $raw->status, ' ', $raw->headers['x-request-id'] ?? '', ' ', $raw->data->id, "\n";
```

## Errors

Everything the SDK throws is a `NeuronAIException`, in `Naiuz\Exceptions\`:

- `APIConnectionException`: the API couldn't be reached, or the connection dropped. `APITimeoutException` extends it.
- `APIException`: the API answered with an error. It carries `status`, `type`, `error_code`, `param`, `fields` (each invalid field and its first message, on a validation error), `request_id` and `headers`; `getMessage()` is the message. Each status has its own class:

| Status | Class |
|---|---|
| 400 | `BadRequestException` |
| 401 | `AuthenticationException` |
| 402 | `InsufficientQuotaException` |
| 403 | `PermissionDeniedException` |
| 404 | `NotFoundException` |
| 409 | `ConflictException` |
| 410 | `GoneException` |
| 413 | `PayloadTooLargeException` |
| 415 | `UnsupportedMediaTypeException` |
| 422 | `UnprocessableEntityException` |
| 429 | `RateLimitException`, with `retry_after` in seconds |
| 500 and above | `InternalServerException` |
| any other | `APIException` |

- `WaitTimeoutException`: `createAndWait` ran out of time; `job` is the job as last seen.

**Match on `error_code`, never on the message.** The codes are stable; the messages are written for people and may change. The API's code is `error_code`, because PHP's own `getCode()` is taken: it gives the HTTP status. `Naiuz\ErrorCode` lists every code, and `error_code` stays a plain string, so a code added later still arrives:

```php
use Naiuz\ErrorCode;
use Naiuz\Exceptions\InsufficientQuotaException;
use Naiuz\Exceptions\RateLimitException;

try {
    $client->tts->synthesize(['text' => 'Salom', 'voice_id' => 'kamron']);
} catch (InsufficientQuotaException $error) {
    if ($error->error_code === ErrorCode::InsufficientBalance->value) {
        echo "Top up your balance.\n";
    }
} catch (RateLimitException $error) {
    echo 'Try again in ', $error->retry_after ?? 1, " s.\n";
}
```

An answer outside the API's envelope, such as a proxy's HTML page, still throws the class for its status; its `error_code` and `type` are null, and its message is the status text and the start of the body.

## Timeouts, retries and cancelling

- **The timeout is per attempt:** 5 minutes by default, reading the answer included. Set it on the client, or per call with `['timeout' => …]`. Retries and their waits come on top, so a call can take up to `(max_retries + 1) × timeout` plus the waits.
- **Long voice operations need a longer timeout.** Most calls finish well inside 5 minutes, but a long dialogue can take about four and a half, and `voices->update` or `voices->replaceAudio` re-creating a voice can take about ten. Pass one for those: `$client->voices->replaceAudio($voiceId, ['ref_audio' => $path], ['timeout' => 15 * 60])`.
- **Which HTTP clients get the SDK's timeout.** Guzzle, made by the SDK or given, and Symfony HttpClient, made or given from 6.2 on, get each attempt's timeout from the SDK and follow no redirect. With the curl extension, Guzzle's timeout ends an attempt wherever it waits; without it, it bounds each read. A Symfony PSR-18 client of 5.4 to 6.1, or any other PSR-18 client, keeps its own options: its own timeouts bound each wait, and the SDK stops reading a body that drips in past the timeout.
- **Retries:** a failed attempt is retried up to `max_retries` times, waiting 0.5 s, then 1 s, 2 s and so on, plus up to 25% jitter, at most 8 s. When the server sends `Retry-After`, that wait replaces it, up to 60 s; a longer one fails the call at once, and a 429's exception carries `retry_after`.
- **What is retried** depends on the call, so a retry never charges twice:
  - every call: a 429, and a connection that was never made;
  - reads, deletes, `apiKeys->update` and `apiKeys->revoke`: also a 500, 502, 503 or 504, and a timeout or reset after sending;
  - `tts->synthesize`, `tts->dialogue`, `tts->jobs->create`, `stt->transcribe` and `voices->create`: also any 5xx, a timeout and a reset. They send an `Idempotency-Key` (yours, from `idempotency_key`, or a generated one), the same on every retry, so the server never does the work twice;
  - chat completions, embeddings, rerank, `voices->update` and `voices->replaceAudio`: also a 5xx in the API's own error envelope, but not a proxy's bare 5xx, and not a timeout or reset after sending, since the call may have completed or still be running;
  - `apiKeys->create`: nothing more, since a retry could create a second key.
- On Symfony HttpClient, or another PSR-18 client, the SDK can't tell whether a failed request was sent, so such a failure counts as possibly sent.
- **Cancelling:** the client is synchronous. `timeout` and `max_retries` bound a call; leaving a stream's loop closes it.

## Per-call options

Every method takes an array of options after its own arguments:

| Option | |
|---|---|
| `timeout` | seconds this call's attempts may take |
| `max_retries` | retries for this call |
| `extra_headers` | headers for this call, over the client's |
| `idempotency_key` | the five idempotent calls only: the `Idempotency-Key` to send, at most 191 characters |

Headers go on in this order, each over the ones before: the SDK's own, `default_headers`, the call's Idempotency-Key, then `extra_headers`.

**Left out, or null.** A key you leave out isn't sent. A null is sent as JSON null, which the API reads as "clear it": `$client->voices->update($voiceId, ['ref_text' => null])` removes the transcript, while `$client->voices->update($voiceId, ['name' => 'Support voice'])` leaves it alone. In a multipart upload, a null is left out, since a form has no null. A key a method doesn't take, such as `refText`, is refused before anything is sent, rather than ignored by the API.

## Types

Every request field and every result property is typed. Each request is an array whose keys PHPStan checks against an array shape named after the API's request schema, such as `SynthesizeSpeechRequest` or `CreateVoiceRequest`, which you can import with `@phpstan-import-type` from the resource that defines it. The enums `VoiceCategory`, `TtsJobStatus` and `ApiKeyAccess`, in `Naiuz\Types\`, give the values the API knows today, and a case may be passed where a request takes one.

## Examples

[examples/](https://github.com/naiuz/sdk/tree/main/php/examples) holds eight programs: synthesizing to a file, a dialogue, an async job with waiting, cloning a voice, a transcription, streaming chat, embeddings with rerank, and managing API keys. Each reads its key from `NEURONAI_API_KEY`. To run one from this folder, run `php examples/synthesize.php`.

## License

MIT
