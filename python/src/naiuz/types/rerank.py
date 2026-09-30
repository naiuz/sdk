"""Ranking documents against a query."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypedDict

from .._models import BaseModel, WithCost


class RerankDocument(BaseModel):
    """A ranked document's text."""

    text: str


class RerankResult(BaseModel):
    """One ranked document."""

    index: int
    """The document's position in `documents`, from 0."""
    relevance_score: float
    """How relevant the document is to the query; higher is more relevant."""
    document: RerankDocument | None = None
    """The document's text, unless `return_documents` was False."""


class RerankBilledUnits(BaseModel):
    """The billed input tokens, in Cohere's shape."""

    search_units: int
    input_tokens: int


class RerankMeta(BaseModel):
    """What was billed, in Cohere's shape."""

    billed_units: RerankBilledUnits


class RerankUsage(BaseModel):
    """The same input tokens, in OpenAI's shape."""

    prompt_tokens: int
    total_tokens: int


class RerankResponse(WithCost):
    """The documents ranked by `relevance_score`, highest first."""

    id: str
    """This request's ID, the same as `X-Request-Id`."""
    model: str
    """The model's id."""
    results: list[RerankResult]
    """The documents ranked by `relevance_score`, highest first."""
    meta: RerankMeta
    """The billed input tokens, in Cohere's shape."""
    usage: RerankUsage
    """The same input tokens, in OpenAI's shape."""


class _RerankFields(TypedDict):
    model: str
    """The rerank model's id."""
    query: str
    """The query to rank the documents against."""
    documents: Sequence[str]
    """The documents, at least one."""


class RerankRequest(_RerankFields, total=False):
    """What `rerank.create` ranks."""

    top_n: int | None
    """How many of the best documents to return, 1 or more."""
    return_documents: bool | None
    """False leaves out each result's `document`."""
