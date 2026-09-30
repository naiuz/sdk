"""Chat completions."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, TypedDict

from .._models import BaseModel, WithCost

ChatRole = Literal["system", "user", "assistant", "tool"]
"""Who says a message."""


class ChatMessageParam(TypedDict):
    """One message of the conversation."""

    role: ChatRole
    """`system`, `user`, `assistant` or `tool`."""
    content: str
    """The message's text, as one string. A list of content parts, as OpenAI also takes, is refused."""


class ChatCompletionMessage(BaseModel):
    """The assistant's message."""

    role: Literal["assistant"] | str
    """Always `assistant`."""
    content: str
    """The answer's text."""


class ChatCompletionChoice(BaseModel):
    """One choice of the completion."""

    index: int
    """The choice's position, from 0."""
    message: ChatCompletionMessage
    """The assistant's message."""
    finish_reason: str
    """Why generation stopped, such as `stop`."""


class ChatCompletionUsage(BaseModel):
    """The tokens billed."""

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletion(WithCost):
    """The completion: one choice holding the assistant's message, and `usage` counting the tokens billed."""

    id: str
    """The completion's id."""
    object: Literal["chat.completion"] | str
    """Always `chat.completion`."""
    created: int
    """When the completion was created, in Unix seconds."""
    model: str
    """The model's id."""
    choices: list[ChatCompletionChoice]
    """The choices: one."""
    usage: ChatCompletionUsage
    """The tokens billed."""


class _CreateChatCompletionFields(TypedDict):
    model: str
    """The model's id, from `models.list()`."""
    messages: Sequence[ChatMessageParam]
    """The conversation so far, at least one message."""


class CreateChatCompletionRequest(_CreateChatCompletionFields, total=False):
    """A chat completion request: the keyword arguments of `chat.completions.create`."""

    max_tokens: int | None
    """The most tokens to generate, 1 or more."""
    temperature: float | None
    """From 0 to 2."""
    top_p: float | None
    """From 0 to 1."""
    stop: str | Sequence[str] | None
    """Text at which the model stops: one string, or a list of strings. Sent exactly as given, byte for byte,
    including a string of only whitespace such as a line break."""
    stream: Literal[False] | None
    """Streamed answers arrive in a later version of this SDK; this one reads a whole answer only."""
