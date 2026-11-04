"""The documents agents answer from."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypedDict

from .._models import BaseModel, WithRequestId
from .._uploads import Uploadable


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
    """`pdf`, `docx`, `txt`, `xlsx`, `csv`, `text`, `qa`, `website`, `google_doc` or `google_sheet`."""
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


class CreateTextDocumentRequest(TypedDict):
    """What `knowledge_base.create_text` takes, each as a keyword argument."""

    name: str
    """The document's name."""
    text: str
    """Its text, up to 300,000 characters."""


class CreateQaDocumentRequest(TypedDict):
    """What `knowledge_base.create_qa` takes, each as a keyword argument."""

    name: str
    """The document's name."""
    pairs: Sequence[DocumentPairParam]
    """Up to 2,000 pairs of `question` and `answer`."""


class _CreateLinkDocumentFields(TypedDict):
    url: str
    """An https address."""


class CreateLinkDocumentRequest(_CreateLinkDocumentFields, total=False):
    """What `knowledge_base.create_link` takes, each as a keyword argument."""

    crawl_scope: str | None
    """How far to read a website: this `page`, or the whole `site`."""
    name: str | None
    """The document's name, up to 255 characters. The address's host when left out."""


class _CreateFileDocumentFields(TypedDict):
    file: Uploadable
    """A PDF, a Word document, a spreadsheet or a text file."""


class CreateFileDocumentRequest(_CreateFileDocumentFields, total=False):
    """What `knowledge_base.create_file` takes, each as a keyword argument."""

    name: str | None
    """The document's name, up to 255 characters. The file's when left out."""


class UpdateDocumentRequest(TypedDict, total=False):
    """What `knowledge_base.update` takes, each as a keyword argument."""

    name: str
    """The document's name."""
    text: str
    """A text document's text."""
    pairs: Sequence[DocumentPairParam]
    """A questions document's pairs."""
    crawl_scope: str
    """How far to read a website: this `page`, or the whole `site`."""
