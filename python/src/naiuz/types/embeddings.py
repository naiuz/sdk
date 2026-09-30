"""Dense vectors for text."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, TypedDict

from .._models import BaseModel, WithCost


class Embedding(BaseModel):
    """One input's vector."""

    object: Literal["embedding"] | str
    """Always `embedding`."""
    index: int
    """The position of its input, from 0."""
    embedding: list[float]
    """A 1024-dimensional vector of floats."""


class EmbeddingUsage(BaseModel):
    """The tokens the model counted."""

    prompt_tokens: int
    """The tokens billed."""
    total_tokens: int
    """The tokens counted."""


class EmbeddingResponse(WithCost):
    """One embedding per input, in the order of `input`."""

    object: Literal["list"] | str
    """Always `list`."""
    model: str
    """The model's id."""
    data: list[Embedding]
    """One embedding per input, in the order of `input`."""
    usage: EmbeddingUsage
    """The tokens the model counted; `prompt_tokens` is what is billed."""


class _CreateEmbeddingFields(TypedDict):
    model: str
    """The embedding model's id."""
    input: str | Sequence[str]
    """The text to embed: one string, or a list of strings for a batch."""


class CreateEmbeddingRequest(_CreateEmbeddingFields, total=False):
    """What `embeddings.create` embeds."""

    encoding_format: Literal["float"] | None
    """Only float vectors are served; base64 is an OpenAI option the API does not support."""
