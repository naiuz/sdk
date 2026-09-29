/** A call's result together with the status and headers of the answer it came from. */
export interface WithResponse<T> {
    /** What the call resolves to without `withResponse()`. */
    data: T;
    /** The answer's HTTP status. */
    status: number;
    /** The answer's headers. */
    headers: Headers;
}

/**
 * What every API method returns. Await it for the result, or call
 * `withResponse()` for the result with the answer's status and headers.
 * The request is sent when the method is called.
 */
export class APIPromise<T> implements PromiseLike<T> {
    readonly #response: Promise<WithResponse<T>>;

    constructor(response: Promise<WithResponse<T>>) {
        this.#response = response;
    }

    /** The result together with the answer's status and headers. */
    withResponse(): Promise<WithResponse<T>> {
        return this.#response;
    }

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        return this.#response.then((result) => result.data).then(onfulfilled, onrejected);
    }

    catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult> {
        return this.then(undefined, onrejected);
    }

    finally(onfinally?: (() => void) | null): Promise<T> {
        return this.then().finally(onfinally);
    }
}
