/** What to embed. */
export interface CreateEmbeddingRequest {
    /** The embedding model's id. */
    model: string;
    /** The text to embed: one string, or a list of strings for a batch. */
    input: string | string[];
    /** Only float vectors are served; base64 is an OpenAI option the API does not support. */
    encoding_format?: "float" | (string & {}) | null;
}

/** One input's vector. */
export interface Embedding {
    /** Always `embedding`. */
    object: "embedding" | (string & {});
    /** The position of its input, from 0. */
    index: number;
    /** A 1024-dimensional vector of floats. */
    embedding: number[];
}

/** The tokens the model counted. */
export interface EmbeddingUsage {
    /** The tokens billed. */
    prompt_tokens: number;
    /** The tokens counted. */
    total_tokens: number;
}

/** One embedding per input, in the order of `input`. */
export interface EmbeddingResponse {
    /** Always `list`. */
    object: "list" | (string & {});
    /** The model's id. */
    model: string;
    /** One embedding per input, in the order of `input`. */
    data: Embedding[];
    /** The tokens the model counted; `prompt_tokens` is what is billed. */
    usage: EmbeddingUsage;
}
