import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {readBody, type WithCost} from "../core/parse";
import {readStream, type Stream} from "../core/streaming";
import type {
    ChatCompletion,
    ChatCompletionChunk,
    CreateChatCompletionRequest,
    CreateChatCompletionRequestNonStreaming,
    CreateChatCompletionRequestStreaming,
} from "../types/chat";

/** What a streamed call accepts: the event stream, or an error in the API's JSON envelope. */
const EVENT_STREAM = "text/event-stream, application/json";

/** Chat completions. */
export class Completions {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /**
     * A model response for a chat conversation, billed per token. `cost` is
     * the price from `X-Cost`. A timeout is never retried, because the call
     * may have been charged.
     */
    create(params: CreateChatCompletionRequestNonStreaming, options?: RequestOptions): APIPromise<WithCost<ChatCompletion>>;
    /**
     * With `stream: true`, the answer as it is generated: the call resolves
     * to a Stream once the answer starts, and `for await` gives each
     * ChatCompletionChunk. The last chunk carries `usage` when the model
     * reports its token counts. The timeout bounds the wait for each piece,
     * not the whole answer. A failure after the stream has started comes from
     * the loop as an APIError with status 200 and its code, such as
     * `upstream_error`. A stream is billed when it ends, so it has no `cost`,
     * and it is never retried once it has started.
     */
    create(params: CreateChatCompletionRequestStreaming, options?: RequestOptions): APIPromise<Stream<ChatCompletionChunk>>;
    create(params: CreateChatCompletionRequest, options?: RequestOptions): APIPromise<WithCost<ChatCompletion> | Stream<ChatCompletionChunk>>;
    create(params: CreateChatCompletionRequest, options?: RequestOptions): APIPromise<WithCost<ChatCompletion> | Stream<ChatCompletionChunk>> {
        const request = {method: "POST", path: "/chat/completions", body: params, retry: "paid", options} as const;
        // A JavaScript caller may pass nothing: the API's 422 then arrives as a rejection, like any other answer.
        if ((params as CreateChatCompletionRequest | undefined)?.stream === true) {
            return this.#http.request({...request, accept: EVENT_STREAM}, readStream<ChatCompletionChunk>);
        }
        return this.#http.request(request, readBody<ChatCompletion>);
    }
}

/** Chat. */
export class Chat {
    /** Chat completions. */
    readonly completions: Completions;

    constructor(http: HttpClient) {
        this.completions = new Completions(http);
    }
}
