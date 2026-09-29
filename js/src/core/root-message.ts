/** How deep `rootMessage` follows a cause chain or an AggregateError's `errors`, so a cause that refers back to itself can't loop forever. */
const MAX_DEPTH = 5;

/**
 * The deepest non-empty message in `error`'s cause chain. Node's fetch, when
 * every address of a host refuses the connection, rejects with a TypeError
 * whose cause is an AggregateError with an empty message; when a link's own
 * message is empty, the first non-empty message among its `errors` is used
 * instead.
 */
export function rootMessage(error: unknown, depth = 0): string {
    if (!(error instanceof Error)) return String(error);
    if (depth >= MAX_DEPTH) return error.message;
    const {errors} = error as Error & {errors?: unknown};
    if (error.message === "" && Array.isArray(errors)) {
        for (const inner of errors) {
            const message = rootMessage(inner, depth + 1);
            if (message !== "") return message;
        }
    }
    if (error.cause instanceof Error) {
        const deeper = rootMessage(error.cause, depth + 1);
        if (deeper !== "") return deeper;
    }
    return error.message;
}
