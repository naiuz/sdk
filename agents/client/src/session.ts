import {SessionRefusedError} from "./errors";

const DEFAULT_API_URL = "https://my.neuronai.uz";
const SESSIONS_PATH = "/api/agents/v1/sessions";
const UNAVAILABLE = "unavailable";

/** A session token for this page, from an agent's id. The page's own website is what lets it in. */
export async function requestSession(
    agentId: string,
    voice: boolean,
    apiUrl = DEFAULT_API_URL,
    // Called bare: a browser's fetch throws when it's called as a method of anything else.
    fetcher = globalThis.fetch,
): Promise<{token: string; url: string}> {
    let response: Response;
    try {
        response = await fetcher(`${apiUrl.replace(/\/+$/, "")}${SESSIONS_PATH}`, {
            method: "POST",
            headers: {"Content-Type": "application/json", Accept: "application/json"},
            body: JSON.stringify({agent_id: agentId, mode: voice ? "voice" : "text"}),
        });
    } catch {
        throw new SessionRefusedError(UNAVAILABLE, 0, "The server couldn't be reached.");
    }
    const body = (await response.json().catch(() => null)) as {
        data?: {token?: unknown; url?: unknown};
        error?: {code?: unknown; message?: unknown};
    } | null;
    const {token, url} = body?.data ?? {};
    if (response.ok && typeof token === "string" && typeof url === "string") return {token, url};
    const {code, message} = body?.error ?? {};
    if (typeof code === "string" && typeof message === "string") throw new SessionRefusedError(code, response.status, message);
    throw new SessionRefusedError(UNAVAILABLE, response.status, "The server couldn't start a session.");
}
