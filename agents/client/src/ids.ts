/** A message's client id. `crypto.randomUUID` is there only on https and localhost; a plain http page still has random values. */
export function newClientMessageId(): string {
    const {crypto} = globalThis;
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
