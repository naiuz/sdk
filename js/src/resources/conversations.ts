import type {APIPromise} from "../core/api-promise";
import {readSpeechAudio, type SpeechAudio} from "../core/audio";
import type {HttpClient, RequestOptions} from "../core/http";
import {requestPage, type PagePromise} from "../core/pagination";
import {readEnvelope, type WithRequestId} from "../core/parse";
import type {Conversation, ConversationMessage, ConversationTranscript, CreateConversationMessageRequest, CreateConversationRequest, ListConversationMessagesParams, ListConversationsParams, SentConversationMessage, StartedConversation} from "../types/conversations";

/** What a recording call accepts: the audio, or an error in the API's JSON envelope. */
const AUDIO = "audio/ogg, application/json";

/** What's said in a conversation. */
export class ConversationMessages {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** Stores what the customer said and answers at once, and the agent's reply reaches you by webhook. After the conversation has ended it goes on in the next one, and `conversation_id` says which. */
    create(conversation: string, params: CreateConversationMessageRequest, options?: RequestOptions): APIPromise<WithRequestId<SentConversationMessage>> {
        return this.#http.request({method: "POST", path: "/conversations/{conversation}/messages", pathParams: {conversation}, body: params, retry: "safe", options}, readEnvelope<SentConversationMessage>);
    }

    /** What's been said, oldest first, from wherever you got to. Use it to catch up on anything a webhook missed. */
    list(conversation: string, params: ListConversationMessagesParams = {}, options?: RequestOptions): PagePromise<ConversationMessage> {
        return requestPage<ConversationMessage>(this.#http, {method: "GET", path: "/conversations/{conversation}/messages", pathParams: {conversation}, query: {...params}, retry: "safe", options});
    }
}

/** Your organization's conversations, and carrying one on a channel of your own. */
export class Conversations {
    readonly #http: HttpClient;
    /** What's said in a conversation. */
    readonly messages: ConversationMessages;

    constructor(http: HttpClient) {
        this.#http = http;
        this.messages = new ConversationMessages(http);
    }

    /** Your organization's conversations from every channel, newest first. Loop over the result for every one, each page fetched when the loop reaches it. */
    list(params: ListConversationsParams = {}, options?: RequestOptions): PagePromise<Conversation> {
        return requestPage<Conversation>(this.#http, {method: "GET", path: "/conversations", query: {...params}, retry: "safe", options});
    }

    /** One conversation, with its variables, summary and cost, and whether it has audio. */
    retrieve(conversation: string, options?: RequestOptions): APIPromise<WithRequestId<Conversation>> {
        return this.#http.request({method: "GET", path: "/conversations/{conversation}", pathParams: {conversation}, retry: "safe", options}, readEnvelope<Conversation>);
    }

    /** What the customer, the agent and operators said, all in one answer. */
    transcript(conversation: string, options?: RequestOptions): APIPromise<WithRequestId<ConversationTranscript>> {
        return this.#http.request({method: "GET", path: "/conversations/{conversation}/transcript", pathParams: {conversation}, retry: "safe", options}, readEnvelope<ConversationTranscript>);
    }

    /** The recording of a call, as Ogg Opus. No recording, or one past its time, raises NotFound. */
    audio(conversation: string, options?: RequestOptions): APIPromise<SpeechAudio> {
        return this.#http.request({method: "GET", path: "/conversations/{conversation}/audio", pathParams: {conversation}, accept: AUDIO, retry: "safe", options}, readSpeechAudio);
    }

    /** A conversation on a channel of your own. Nothing is sent until the customer says something, and then the agent's first message and its answer reach you by webhook. */
    create(params: CreateConversationRequest, options?: RequestOptions): APIPromise<WithRequestId<StartedConversation>> {
        return this.#http.request({method: "POST", path: "/conversations", body: params, retry: "once", options}, readEnvelope<StartedConversation>);
    }
}
