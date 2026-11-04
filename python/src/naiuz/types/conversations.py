"""Your organization's conversations, and carrying one on a channel of your own."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypedDict

from .._models import BaseModel, WithRequestId


class ConversationContactParam(TypedDict, total=False):
    """Who a new conversation is with."""

    external_id: str
    """Your own id for them. Their conversations share one contact."""
    name: str
    """Their name."""
    phone: str
    """Their phone number."""


class ConversationContact(BaseModel):
    """Who a conversation is with."""

    external_id: str | None
    """Your own id for them."""
    name: str | None
    """Their name."""
    phone: str | None
    """Their phone number."""


class Conversation(WithRequestId):
    """A conversation. `variables`, `summary`, `cost` and `has_audio` come with `retrieve`."""

    id: str
    """The conversation's id, `conv_…`."""
    agent_id: str | None
    """The agent's id."""
    source: str | None
    """Where it came from, such as `telegram` or `api`."""
    mode: str
    """`text` or `voice`."""
    status: str
    """Its status, such as `ai_handling` or `resolved`."""
    language: str | None
    """The language it's in."""
    contact: ConversationContact
    """Who it's with."""
    started_at: str | None
    """When it started."""
    last_message_at: str | None
    """When the last message was."""
    ended_at: str | None
    """When it ended."""
    end_reason: str | None
    """Why it ended."""
    variables: dict[str, Any] | None = None
    """The values it was given."""
    summary: str | None = None
    """A summary, once it has ended."""
    cost: float | None = None
    """What it has cost, in credits."""
    has_audio: bool | None = None
    """Whether there's a recording."""


class StartedConversation(WithRequestId):
    """A new conversation."""

    id: str
    """The conversation's id, `conv_…`."""
    agent_id: str
    """The agent's id."""
    status: str
    """Its status."""
    contact: ConversationContact
    """Who it's with."""
    created_at: str
    """When it started."""


class ConversationMessage(WithRequestId):
    """Something said in a conversation."""

    id: str
    """The message's id."""
    role: str
    """`customer`, `agent` or `operator`."""
    text: str
    """What was said."""
    client_message_id: str | None
    """Your own id for a message you sent."""
    occurred_at: str
    """When it was said."""


class SentConversationMessage(WithRequestId):
    """A customer's message, stored."""

    id: str
    """The message's id."""
    conversation_id: str
    """The conversation it landed in: the next one, if this had ended."""
    client_message_id: str
    """Your own id for it."""
    occurred_at: str
    """When it was stored."""


class ConversationTranscript(WithRequestId):
    """Everything said in a conversation."""

    conversation_id: str
    """The conversation's id."""
    messages: list[ConversationMessage]
    """Oldest first."""
    truncated: bool
    """Whether a very long one stopped short."""


class _CreateConversationFields(TypedDict):
    agent_id: str
    """The agent that answers."""


class CreateConversationRequest(_CreateConversationFields, total=False):
    """What `conversations.create` takes, each as a keyword argument."""

    contact: ConversationContactParam
    """Who it's with."""
    variables: Mapping[str, str | int | float | bool]
    """Values for the agent's `{{variables}}`."""


class CreateConversationMessageRequest(TypedDict):
    """What `conversations.messages.create` takes, each as a keyword argument."""

    client_message_id: str
    """Your own id for this message: letters, digits, `_` and `-`, up to 64. Sending it again stores it once."""
    text: str
    """What the customer said, up to 10,000 characters."""
