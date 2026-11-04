import type {Uploadable} from "./uploads";

/** An agent that uses a document. */
export interface DocumentUser {
    /** The agent's id. */
    id: string;
    /** The agent's name. */
    name: string;
    /** Whether its live version uses it. */
    published: boolean;
}

/** A question and its answer. */
export interface DocumentPair {
    /** The question. */
    question: string;
    /** Its answer. */
    answer: string;
}

/** A document agents answer from. */
export interface KnowledgeDocument {
    /** The document's id. */
    id: number;
    /** Its name. */
    name: string;
    /** `pdf`, `docx`, `txt`, `xlsx`, `csv`, `text`, `qa`, `website`, `google_doc` or `google_sheet`. */
    kind: string;
    /** How far reading it has got, such as `processing` or `ready`. */
    status: string;
    /** Why reading it failed. */
    failure_reason: string | null;
    /** Whether agents can find it. */
    searchable: boolean;
    /** A link's address. */
    source_url: string | null;
    /** How far a website is read. */
    crawl_scope: string | null;
    /** When a link was last read. */
    last_fetched_at: string | null;
    /** When a link is next read. */
    next_refresh_at: string | null;
    /** Its size. */
    bytes: number;
    /** Its characters. */
    char_count: number;
    /** Its pages. */
    page_count: number;
    /** A spreadsheet's rows. */
    row_count: number;
    /** The pages read from images. */
    ocr_pages: number;
    /** The passages it was split into. */
    chunk_count: number;
    /** Whether it was cut short. */
    truncated: boolean;
    /** A website's pages read so far. */
    pages_done: number;
    /** A website's pages found so far. */
    pages_total: number;
    /** How many characters over the limit it was. */
    refused_char_count: number | null;
    /** When it was added. */
    created_at: string | null;
    /** When it last changed. */
    updated_at: string | null;
    /** The agents that use it. */
    used_by: DocumentUser[];
    /** A text document's text. */
    text?: string | null;
    /** A questions document's pairs. */
    pairs?: DocumentPair[] | null;
}

/** How much of its room an organization has used. */
export interface KnowledgeUsage {
    /** Characters used. */
    used: number;
    /** Characters it can hold. */
    limit: number;
    /** Characters that can be in every prompt. */
    always_limit: number;
}

/** An organization's documents. */
export interface KnowledgeDocuments {
    /** The documents. */
    documents: KnowledgeDocument[];
    /** How much of its room they use. */
    usage: KnowledgeUsage;
}

/** A question and its answer. */
export interface DocumentPairParam {
    /** The question. */
    question: string;
    /** Its answer. */
    answer: string;
}

/** What `createTextDocument` takes. */
export interface CreateTextDocumentRequest {
    /** The document's name. */
    name: string;
    /** Its text, up to 300,000 characters. */
    text: string;
}

/** What `createQaDocument` takes. */
export interface CreateQaDocumentRequest {
    /** The document's name. */
    name: string;
    /** Up to 2,000 pairs of `question` and `answer`. */
    pairs: DocumentPairParam[];
}

/** What `createLinkDocument` takes. */
export interface CreateLinkDocumentRequest {
    /** An https address. */
    url: string;
    /** How far to read a website: this `page`, or the whole `site`. */
    crawl_scope?: string | null;
    /** The document's name, up to 255 characters. The address's host when left out. */
    name?: string | null;
}

/** What `createFileDocument` takes. */
export interface CreateFileDocumentRequest {
    /** A PDF, a Word document, a spreadsheet or a text file. */
    file: Uploadable;
    /** The document's name, up to 255 characters. The file's when left out. */
    name?: string | null;
}

/** What `updateDocument` takes. */
export interface UpdateDocumentRequest {
    /** The document's name. */
    name?: string;
    /** A text document's text. */
    text?: string;
    /** A questions document's pairs. */
    pairs?: DocumentPairParam[];
    /** How far to read a website: this `page`, or the whole `site`. */
    crawl_scope?: string;
}

/** What `deleteDocument` takes. */
export interface DeleteDocumentParams {
    /** Take it off the agents that use it. Without this, one in use raises a conflict naming them. */
    detach?: boolean | null;
}
