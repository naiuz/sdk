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


class ChatCompletionChunkDelta(BaseModel):
    """The piece of the assistant's message a chunk carries."""

    role: Literal["assistant"] | str | None = None
    """`assistant`, on the stream's first chunk only."""
    content: str | None = None
    """The next piece of the answer's text."""


class ChatCompletionChunkChoice(BaseModel):
    """A chunk's choice: the next piece of the assistant's message."""

    index: int
    """The choice's position, from 0."""
    delta: ChatCompletionChunkDelta
    """The next piece of the message: the role on the first chunk, then the text piece by piece. The chunk that ends
    the answer may leave it empty."""
    finish_reason: str | None
    """None until the chunk that ends the answer, which names why it stopped, such as `stop`."""


class ChatCompletionChunk(BaseModel):
    """One event of a streamed chat completion (`stream=True`).

    The API document describes these chunks in prose rather than as a schema, so this type follows that prose and the
    contract fixture: first a chunk whose delta holds the role, then one for each piece of the answer, the last of them
    naming the finish reason, and then, when the model reports its token counts, a chunk with no choices and `usage`.
    Every chunk repeats the same `id`, `created` and `model`.
    """

    id: str
    """The completion's id, the same on every chunk."""
    object: Literal["chat.completion.chunk"] | str
    """Always `chat.completion.chunk`."""
    created: int
    """When the completion was created, in Unix seconds."""
    model: str
    """The model's id."""
    choices: list[ChatCompletionChunkChoice]
    """One choice holding the next piece of the message; empty on the final usage chunk."""
    usage: ChatCompletionUsage | None = None
    """The tokens billed: on the last chunk only, and only when the model reports its token counts."""


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
    stream: bool | None
    """True streams the answer as it is generated: `create` then returns a stream of ChatCompletionChunk."""
