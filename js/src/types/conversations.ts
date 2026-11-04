/** Who a conversation is with. */
export interface ConversationContact {
    /** Your own id for them. */
    external_id: string | null;
    /** Their name. */
    name: string | null;
    /** Their phone number. */
    phone: string | null;
}

/** A conversation. `variables`, `summary`, `cost` and `has_audio` come with `retrieve`. */
export interface Conversation {
    /** The conversation's id, `conv_…`. */
    id: string;
    /** The agent's id. */
    agent_id: string | null;
    /** Where it came from, such as `telegram` or `api`. */
    source: string | null;
    /** `text` or `voice`. */
    mode: string;
    /** Its status, such as `ai_handling` or `resolved`. */
    status: string;
    /** The language it's in. */
    language: string | null;
    /** Who it's with. */
    contact: ConversationContact;
    /** When it started. */
    started_at: string | null;
    /** When the last message was. */
    last_message_at: string | null;
    /** When it ended. */
    ended_at: string | null;
    /** Why it ended. */
    end_reason: string | null;
    /** The values it was given. */
    variables?: Record<string, unknown>;
    /** A summary, once it has ended. */
    summary?: string | null;
    /** What it has cost, in credits. */
    cost?: number;
    /** Whether there's a recording. */
    has_audio?: boolean;
}

/** A new conversation. */
export interface StartedConversation {
    /** The conversation's id, `conv_…`. */
    id: string;
    /** The agent's id. */
    agent_id: string;
    /** Its status. */
    status: string;
    /** Who it's with. */
    contact: ConversationContact;
    /** When it started. */
    created_at: string;
}

/** Something said in a conversation. */
export interface ConversationMessage {
    /** The message's id. */
    id: string;
    /** `customer`, `agent` or `operator`. */
    role: string;
    /** What was said. */
    text: string;
    /** Your own id for a message you sent. */
    client_message_id: string | null;
    /** When it was said. */
    occurred_at: string;
}

/** A customer's message, stored. */
export interface SentConversationMessage {
    /** The message's id. */
    id: string;
    /** The conversation it landed in: the next one, if this had ended. */
    conversation_id: string;
    /** Your own id for it. */
    client_message_id: string;
    /** When it was stored. */
    occurred_at: string;
}

/** Everything said in a conversation. */
export interface ConversationTranscript {
    /** The conversation's id. */
    conversation_id: string;
    /** Oldest first. */
    messages: ConversationMessage[];
    /** Whether a very long one stopped short. */
    truncated: boolean;
}

/** Who a new conversation is with. */
export interface ConversationContactParam {
    /** Your own id for them. Their conversations share one contact. */
    external_id?: string;
    /** Their name. */
    name?: string;
    /** Their phone number. */
    phone?: string;
}

/** What `listConversations` takes. */
export interface ListConversationsParams {
    /** Only this agent's. */
    agent_id?: string | null;
    /** Only those in this status, such as `resolved`. */
    status?: string | null;
    /** How many, from 1 to 100 (50 when left out). */
    limit?: number | null;
    /** A page's `next_cursor`, to start from the page after it. */
    cursor?: string | null;
}

/** What `createConversation` takes. */
export interface CreateConversationRequest {
    /** The agent that answers. */
    agent_id: string;
    /** Who it's with. */
    contact?: ConversationContactParam;
    /** Values for the agent's `{{variables}}`. */
    variables?: Record<string, string | number | boolean>;
}

/** What `createConversationMessage` takes. */
export interface CreateConversationMessageRequest {
    /** Your own id for this message: letters, digits, `_` and `-`, up to 64. Sending it again stores it once. */
    client_message_id: string;
    /** What the customer said, up to 10,000 characters. */
    text: string;
}

/** What `listConversationMessages` takes. */
export interface ListConversationMessagesParams {
    /** The message to read on from. */
    after?: string | number | null;
    /** How many, from 1 to 100 (50 when left out). */
    limit?: number | null;
    /** A page's `next_cursor`, to start from the page after it. */
    cursor?: string | null;
}
