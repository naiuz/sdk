/** A chat model. Send its `id` as `model`. */
export interface Model {
    /** The model's id. */
    id: string;
    /** Always `model`. */
    object: "model" | (string & {});
    /** Always `0`. */
    created: number;
    /** Who serves the model. */
    owned_by: string;
}

/** The chat models, in OpenAI's list shape. */
export interface ModelList {
    /** Always `list`. */
    object: "list" | (string & {});
    /** The models. */
    data: Model[];
}
