/** The socket closed before the session started. */
export class SessionError extends Error {
    constructor(readonly code: number, readonly reason: string) {
        super(`The session closed with ${String(code)}${reason === "" ? "" : ` (${reason})`}.`);
        this.name = "SessionError";
    }
}

/** The server wouldn't give a session for the agent's id: its code and message say why, such as origin_not_allowed. */
export class SessionRefusedError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) {
        super(message);
        this.name = "SessionRefusedError";
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
