/** Documents to rank against a query. */
export interface RerankRequest {
    /** The rerank model's id. */
    model: string;
    /** The query to rank the documents against. */
    query: string;
    /** The documents, at least one. */
    documents: string[];
    /** How many of the best documents to return, 1 or more. */
    top_n?: number | null;
    /** `false` leaves out each result's `document`. */
    return_documents?: boolean | null;
}

/** One ranked document. */
export interface RerankResult {
    /** The document's position in `documents`, from 0. */
    index: number;
    /** How relevant the document is to the query; higher is more relevant. */
    relevance_score: number;
    /** The document's text, unless `return_documents` was `false`. */
    document?: {text: string};
}

/** The documents ranked by `relevance_score`, highest first. */
export interface RerankResponse {
    /** This request's ID, the same as `X-Request-Id`. */
    id: string;
    /** The model's id. */
    model: string;
    /** The documents ranked by `relevance_score`, highest first. */
    results: RerankResult[];
    /** The billed input tokens, in Cohere's shape. */
    meta: {billed_units: {search_units: number; input_tokens: number}};
    /** The same input tokens, in OpenAI's shape. */
    usage: {prompt_tokens: number; total_tokens: number};
}
