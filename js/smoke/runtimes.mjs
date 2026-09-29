// Loads the built package and makes mocked calls, to prove it runs on Bun and Deno as on Node.
// Run it after `npm run build`: `bun smoke/runtimes.mjs`, or
// `deno run --no-prompt --allow-read --allow-write --allow-net=127.0.0.1 --allow-env=TMPDIR,TMP,TEMP smoke/runtimes.mjs`.
import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {APIConnectionError, APITimeoutError, NeuronAI, RateLimitError, SpeechAudio, Stream} from "../dist/index.js";

const KEY = "nai_runtime_smoke_key";
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]);
const runtime = typeof globalThis.Deno === "object" ? "Deno" : typeof globalThis.Bun === "object" ? "Bun" : "Node";

/** A client whose fetch hands each request, parsed as fetch would send it, to `answer`. */
function clientAnswering(answer, options = {}) {
    const requests = [];
    const fetch = (url, init) => {
        const request = new Request(url, init);
        requests.push(request);
        return Promise.resolve(answer(request, init));
    };
    return {client: new NeuronAI({apiKey: KEY, fetch, maxRetries: 0, ...options}), requests};
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", ...headers}});

const checks = {
    async "builds a client from its options, with no permission to read the environment"() {
        const {client} = clientAnswering(() => json(200, {}));
        assert.equal(client.baseURL, "https://my.neuronai.uz/api/v1");
    },

    async "sends the key and a User-Agent that names the runtime"() {
        const {client, requests} = clientAnswering(() => json(200, {data: {balance: 1}, request_id: "req-1"}));
        const balance = await client.account.balance();
        assert.equal(balance.balance, 1);
        assert.equal(balance.request_id, "req-1");
        assert.equal(requests[0].headers.get("authorization"), `Bearer ${KEY}`);
        assert.match(requests[0].headers.get("user-agent"), new RegExp(`^naiuz-js/\\S+ \\(${runtime} \\d+\\.\\d+\\)$`));
    },

    async "walks every page of a list"() {
        const {client} = clientAnswering((request) => {
            const cursor = new URL(request.url).searchParams.get("cursor");
            return json(200, cursor === null ? {data: [{id: "a"}], next_cursor: "c2", request_id: "r1"} : {data: [{id: "b"}], next_cursor: null, request_id: "r2"});
        });
        const ids = [];
        for await (const voice of client.voices.list()) ids.push(voice.id);
        assert.deepEqual(ids, ["a", "b"]);
    },

    async "reads speech audio and saves it to a file"() {
        const {client} = clientAnswering(() => new Response(WAV, {headers: {"content-type": "audio/wav", "x-cost": "12.5", "x-voice-custom": "1"}}));
        const audio = await client.tts.synthesize({text: "Salom"});
        assert.ok(audio instanceof SpeechAudio);
        assert.deepEqual([audio.cost, audio.voice_custom, audio.replayed], [12.5, true, false]);
        const directory = await mkdtemp(join(tmpdir(), "naiuz-smoke-"));
        try {
            await audio.save(join(directory, "speech.wav"));
            assert.deepEqual(new Uint8Array(await readFile(join(directory, "speech.wav"))), WAV);
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    },

    async "uploads a file as multipart, with its filename and content type"() {
        const {client, requests} = clientAnswering(() => json(200, {data: {text: "Salom"}, request_id: "req-1"}));
        await client.stt.transcribe({file: {data: WAV, filename: "clip.m4a"}, language: "uz"});
        assert.match(requests[0].headers.get("content-type"), /^multipart\/form-data; boundary=/);
        // Checked on the wire: Bun's own multipart parser types a part by its filename, not by its header.
        const wire = await requests[0].text();
        assert.match(wire, /Content-Disposition: form-data; name="file"; filename="clip\.m4a"\r\nContent-Type: audio\/mp4\r\n\r\nRIFF/);
        assert.match(wire, /Content-Disposition: form-data; name="language"\r\n\r\nuz\r\n/);
    },

    async "streams a chat completion to [DONE]"() {
        const events = ['{"object":"chat.completion.chunk","n":1}', '{"object":"chat.completion.chunk","n":2}', "[DONE]"];
        const {client} = clientAnswering(() => new Response(events.map((data) => `data: ${data}\n\n`).join(""), {headers: {"content-type": "text/event-stream"}}));
        const stream = await client.chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}], stream: true});
        assert.ok(stream instanceof Stream);
        const numbers = [];
        for await (const chunk of stream) numbers.push(chunk.n);
        assert.deepEqual(numbers, [1, 2]);
    },

    async "maps a 429 to RateLimitError with its Retry-After"() {
        const {client} = clientAnswering(() => json(429, {error: {type: "rate_limit_error", code: "rate_limit_exceeded", message: "Too many requests.", param: null}, request_id: "req-1"}, {"retry-after": "12"}));
        await assert.rejects(client.account.balance(), (error) => error instanceof RateLimitError && error.retry_after === 12);
    },

    async "times out an attempt that gets no answer"() {
        const fetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
        const client = new NeuronAI({apiKey: KEY, fetch, timeout: 50, maxRetries: 0});
        await assert.rejects(client.account.balance(), APITimeoutError);
    },

    async "sends a paid call once when the connection drops mid-answer"() {
        let received = 0;
        const server = createServer((request, response) => {
            received += 1;
            request.resume();
            request.on("end", () => {
                response.writeHead(200, {"content-type": "application/json", "content-length": "100"});
                response.write('{"id":"chatcmpl-1",');
                setTimeout(() => request.socket.destroy(), 20);
            });
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
            const client = new NeuronAI({apiKey: KEY, baseURL: `http://127.0.0.1:${String(server.address().port)}/api/v1`, maxRetries: 2});
            await assert.rejects(client.chat.completions.create({model: "m", messages: [{role: "user", content: "Salom!"}]}), APIConnectionError);
            assert.equal(received, 1);
        } finally {
            server.close();
        }
    },
};

let failed = 0;
for (const [name, check] of Object.entries(checks)) {
    try {
        await check();
        console.log(`ok - ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`not ok - ${name}`);
        console.log(error);
    }
}
console.log(`${runtime}: ${String(Object.keys(checks).length - failed)} of ${String(Object.keys(checks).length)} checks passed.`);
if (failed > 0) throw new Error(`${String(failed)} runtime check(s) failed.`);
