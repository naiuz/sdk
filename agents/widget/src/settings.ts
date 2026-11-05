/** What a widget is, as the server tells a page: GET /api/agents/v1/widgets/{key}. */
export type Locale = "uz" | "ru" | "en";

export type WidgetMode = "voice_and_text" | "text" | "voice";

export interface LauncherMessageTiming {
    style: "fade" | "slide" | "pop";
    delay: number;
    /** Seconds it stays. Null leaves it until the visitor opens the chat. */
    duration: number | null;
    repeats: number;
}

export interface WidgetBranding {
    primary_color?: string | null;
    text_color?: string | null;
    icon_color?: string | null;
    orb_color?: string | null;
    orb_color_2?: string | null;
    bubble_icon?: string | null;
    position?: string | null;
    launcher_message?: LauncherMessageTiming | null;
    logo_url?: string | null;
}

export interface WidgetTexts {
    title: string;
    subtitle: string | null;
    welcome: string | null;
    launcher_label: string | null;
    consent_text: string | null;
    terms_text: string | null;
    suggested_questions: string[];
}

export type ContactField = "name" | "phone" | "email";

export interface WidgetContact {
    mode: "before_chat" | "agent_asks" | "none";
    fields: Record<ContactField, {enabled: boolean; required: boolean}>;
    consent: {text: string | null; privacy_policy_url: string | null} | null;
}

export interface WidgetFeatures {
    voice: boolean;
    attachments: boolean;
    sound: boolean;
    feedback: boolean;
    in_page_links: boolean;
}

export interface WidgetSettings {
    available: true;
    mode: WidgetMode;
    locale: Locale;
    languages: string[];
    branding: WidgetBranding;
    texts: WidgetTexts;
    contact: WidgetContact;
    features: WidgetFeatures;
    terms: {text: string | null; url: string | null} | null;
    unread: number;
    has_conversation: boolean;
    last_message: {excerpt: string; at: string | null} | null;
}

export interface ContactDetails {
    name?: string;
    phone?: string;
    email?: string;
    consent?: boolean;
}

export interface Attachment {
    id: number;
    file_name: string;
    file_type: string | null;
    file_size: number | null;
    preview_kind?: string | null;
    preview_url?: string | null;
    download_url?: string | null;
}

export interface Quote {
    id: number;
    sender_type: string;
    sender_label: string;
    excerpt: string | null;
}

/** A message as the log gives it: GET /api/agents/v1/widgets/{key}/messages. */
export interface LogMessage {
    id: number;
    /** The conversation it's in: a visitor's log runs across them, and a thumb goes to the one going on. */
    conversation_id: string | null;
    client_message_id: string | null;
    event_id: number | null;
    feedback: "like" | "dislike" | null;
    operator: {name: string | null; avatar_url: string | null} | null;
    sender_type: "customer" | "ai" | "operator" | "system";
    content: string | null;
    display_text?: string | null;
    reply_to: Quote | null;
    attachments: Attachment[];
    created_at: string | null;
}
