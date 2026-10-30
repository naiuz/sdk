/** The socket closed before the session started. */
export class SessionError extends Error {
    constructor(readonly code: number, readonly reason: string) {
        super(`The session closed with ${String(code)}${reason === "" ? "" : ` (${reason})`}.`);
        this.name = "SessionError";
    }
}

/** A message the server didn't save. */
export class MessageError extends Error {
    constructor(readonly clientMessageId: string, readonly retryable: boolean, readonly code: string) {
        super(`Message ${clientMessageId} wasn't saved: ${code}.`);
        this.name = "MessageError";
    }
}

/** The microphone couldn't start: refused, missing or busy. The browser's error is its cause. */
export class MicrophoneError extends Error {
    constructor(cause: unknown) {
        super(`The microphone couldn't start${cause instanceof Error ? ` (${cause.name})` : ""}.`, {cause});
        this.name = "MicrophoneError";
    }
}
