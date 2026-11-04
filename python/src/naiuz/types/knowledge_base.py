"""The documents agents answer from."""

from __future__ import annotations

from typing import TypedDict

from .._models import BaseModel, WithRequestId


class DocumentPairParam(TypedDict):
    """A question and its answer."""

    question: str
    """The question."""
    answer: str
    """Its answer."""


class DocumentUser(BaseModel):
    """An agent that uses a document."""

    id: str
    """The agent's id."""
    name: str
    """The agent's name."""
    published: bool
    """Whether its live version uses it."""


class DocumentPair(BaseModel):
    """A question and its answer."""

    question: str
    """The question."""
    answer: str
    """Its answer."""


class KnowledgeDocument(WithRequestId):
    """A document agents answer from."""

    id: int
    """The document's id."""
    name: str
    """Its name."""
    kind: str
    """`file`, `text`, `qa` or a link's kind."""
    status: str
    """How far reading it has got, such as `processing` or `ready`."""
    failure_reason: str | None
    """Why reading it failed."""
    searchable: bool
    """Whether agents can find it."""
    source_url: str | None
    """A link's address."""
    crawl_scope: str | None
    """How far a website is read."""
    last_fetched_at: str | None
    """When a link was last read."""
    next_refresh_at: str | None
    """When a link is next read."""
    bytes: int
    """Its size."""
    char_count: int
    """Its characters."""
    page_count: int
    """Its pages."""
    row_count: int
    """A spreadsheet's rows."""
    ocr_pages: int
    """The pages read from images."""
    chunk_count: int
    """The passages it was split into."""
    truncated: bool
    """Whether it was cut short."""
    pages_done: int
    """A website's pages read so far."""
    pages_total: int
    """A website's pages found so far."""
    refused_char_count: int | None
    """How many characters over the limit it was."""
    created_at: str | None
    """When it was added."""
    updated_at: str | None
    """When it last changed."""
    used_by: list[DocumentUser]
    """The agents that use it."""
    text: str | None = None
    """A text document's text."""
    pairs: list[DocumentPair] | None = None
    """A questions document's pairs."""


class KnowledgeUsage(BaseModel):
    """How much of its room an organization has used."""

    used: int
    """Characters used."""
    limit: int
    """Characters it can hold."""
    always_limit: int
    """Characters that can be in every prompt."""


class KnowledgeDocuments(WithRequestId):
    """An organization's documents."""

    documents: list[KnowledgeDocument]
    """The documents."""
    usage: KnowledgeUsage
    """How much of its room they use."""
