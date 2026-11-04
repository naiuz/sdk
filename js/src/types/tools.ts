/** An agent that uses a tool. */
export interface ToolUser {
    /** The agent's id. */
    id: string;
    /** The agent's name. */
    name: string;
    /** Whether its live version uses it. */
    published: boolean;
}

/** A tool agents can use. `config` comes with `retrieve`, `create` and `update`. */
export interface Tool {
    /** The tool's id. */
    id: number;
    /** `webhook` or `client`, or a kind the platform manages. */
    kind: string;
    /** Its name. */
    name: string;
    /** What it does and when to use it. */
    description: string;
    /** What it calls. */
    target: string | null;
    /** When it was last tested. */
    last_test_at: string | null;
    /** How the last test went. */
    last_test_status: string | null;
    /** The agents that use it. */
    used_by: ToolUser[];
    /** Whether a client tool's result is waited for. */
    wait_for_result: boolean | null;
    /** How long a client tool has, in seconds. */
    timeout_s: number | null;
    /** What it calls, with its parameters. Secrets appear by id. */
    config?: Record<string, unknown>;
}

/** What `updateTool` takes. */
export interface SaveToolRequest {
    /** `webhook` or `client`. */
    kind: string;
    /** Its name. */
    name: string;
    /** What it does and when to use it. */
    description: string;
    /** What it calls, with its parameters. */
    config: Record<string, unknown>;
    /** The result of a test this config passed. */
    last_test_status?: string | null;
}

/** What `deleteTool` takes. */
export interface DeleteToolParams {
    /** Take it off the agents that use it. Without this, one in use raises a conflict naming them. */
    detach?: boolean | null;
}
