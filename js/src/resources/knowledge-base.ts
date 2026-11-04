import type {APIPromise} from "../core/api-promise";
import type {HttpClient, RequestOptions} from "../core/http";
import {readEnvelope, readNoContent, type WithRequestId} from "../core/parse";
import type {CreateFileDocumentRequest, CreateLinkDocumentRequest, CreateQaDocumentRequest, CreateTextDocumentRequest, DeleteDocumentParams, KnowledgeDocument, KnowledgeDocuments, UpdateDocumentRequest} from "../types/knowledge-base";

/** The documents agents answer from. */
export class KnowledgeBase {
    readonly #http: HttpClient;

    constructor(http: HttpClient) {
        this.#http = http;
    }

    /** Your organization's documents, and how much of its room they use. */
    list(options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocuments>> {
        return this.#http.request({method: "GET", path: "/knowledge-base", retry: "safe", options}, readEnvelope<KnowledgeDocuments>);
    }

    /** One document, and how far reading it has got. */
    retrieve(document: string | number, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>> {
        return this.#http.request({method: "GET", path: "/knowledge-base/{document}", pathParams: {document: String(document)}, retry: "safe", options}, readEnvelope<KnowledgeDocument>);
    }

    /** Adds text you type in. It's read in the background, and `status` says how far that's got. */
    createText(params: CreateTextDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>> {
        return this.#http.request({method: "POST", path: "/knowledge-base/text", body: params, retry: "once", options}, readEnvelope<KnowledgeDocument>);
    }

    /** Adds pairs of a question and its answer, each found on its own. */
    createQa(params: CreateQaDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>> {
        return this.#http.request({method: "POST", path: "/knowledge-base/qa", body: params, retry: "once", options}, readEnvelope<KnowledgeDocument>);
    }

    /** Adds a website or a Google file by its address, which is read again every week. */
    createLink(params: CreateLinkDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>> {
        return this.#http.request({method: "POST", path: "/knowledge-base/link", body: params, retry: "once", options}, readEnvelope<KnowledgeDocument>);
    }

    /** Adds a file, sent as multipart/form-data. */
    createFile(params: CreateFileDocumentRequest, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>> {
        return this.#http.request({method: "POST", path: "/knowledge-base/file", multipart: {params, files: ["file"]}, retry: "once", options}, readEnvelope<KnowledgeDocument>);
    }

    /** Changes the name, or what each kind holds. What changes the content is read again. */
    update(document: string | number, params: UpdateDocumentRequest = {}, options?: RequestOptions): APIPromise<WithRequestId<KnowledgeDocument>> {
        return this.#http.request({method: "PUT", path: "/knowledge-base/{document}", pathParams: {document: String(document)}, body: params, retry: "safe", options}, readEnvelope<KnowledgeDocument>);
    }

    /** Reads a link document again now, or tries a file that failed again. */
    refresh(document: string | number, options?: RequestOptions): APIPromise<void> {
        return this.#http.request({method: "POST", path: "/knowledge-base/{document}/refresh", pathParams: {document: String(document)}, retry: "safe", options}, readNoContent);
    }

    /** Deletes a document. */
    delete(document: string | number, params: DeleteDocumentParams = {}, options?: RequestOptions): APIPromise<void> {
        return this.#http.request({method: "DELETE", path: "/knowledge-base/{document}", pathParams: {document: String(document)}, query: {...params}, retry: "safe", options}, readNoContent);
    }
}
