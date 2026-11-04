"""The documents agents answer from."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope, read_nothing
from ..._uploads import Form, Uploadable
from ...types.knowledge_base import DocumentPairParam, KnowledgeDocument, KnowledgeDocuments
from .._io import to_raw
from .._resource import AsyncAPIResource


class AsyncKnowledgeBase(AsyncAPIResource):
    """The documents agents answer from."""

    @property
    def with_raw_response(self) -> AsyncKnowledgeBaseWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AsyncKnowledgeBaseWithRawResponse(self)

    async def list(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> KnowledgeDocuments:
        """Your organization's documents, and how much of its room they use."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/knowledge-base", "safe", options=options)
        return await self._http.request(request, read_envelope(KnowledgeDocuments))

    async def retrieve(
        self,
        document: str | int,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> KnowledgeDocument:
        """One document, and how far reading it has got."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest(
            "GET", "/knowledge-base/{document}", "safe", path_params={"document": str(document)}, options=options
        )
        return await self._http.request(request, read_envelope(KnowledgeDocument))

    async def create_text(
        self,
        *,
        name: str,
        text: str,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> KnowledgeDocument:
        """Adds text you type in.

        It's read in the background, and `status` says how far that's got.

        Args:
            name: The document's name.
            text: Its text, up to 300,000 characters.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(name=name, text=text)
        request = APIRequest("POST", "/knowledge-base/text", "once", body=body, options=options)
        return await self._http.request(request, read_envelope(KnowledgeDocument))

    async def create_qa(
        self,
        *,
        name: str,
        pairs: Sequence[DocumentPairParam],
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> KnowledgeDocument:
        """Adds pairs of a question and its answer, each found on its own.

        Args:
            name: The document's name.
            pairs: Up to 2,000 pairs of `question` and `answer`.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(name=name, pairs=pairs)
        request = APIRequest("POST", "/knowledge-base/qa", "once", body=body, options=options)
        return await self._http.request(request, read_envelope(KnowledgeDocument))

    async def create_link(
        self,
        *,
        url: str,
        crawl_scope: str | NotGiven | None = NOT_GIVEN,
        name: str | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> KnowledgeDocument:
        """Adds a website or a Google file by its address, which is read again every week.

        Args:
            url: An https address.
            crawl_scope: How far to read a website: this `page`, or the whole `site`.
            name: The document's name, up to 255 characters. The address's host when left out.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(url=url, crawl_scope=crawl_scope, name=name)
        request = APIRequest("POST", "/knowledge-base/link", "once", body=body, options=options)
        return await self._http.request(request, read_envelope(KnowledgeDocument))

    async def create_file(
        self,
        *,
        file: Uploadable,
        name: str | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> KnowledgeDocument:
        """Adds a file, sent as multipart/form-data.

        Args:
            file: A PDF, a Word document, a spreadsheet or a text file.
            name: The document's name, up to 255 characters. The file's when left out.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        fields = given(file=file, name=name)
        form = Form(fields, files=("file",))
        request = APIRequest("POST", "/knowledge-base/file", "once", form=form, options=options)
        return await self._http.request(request, read_envelope(KnowledgeDocument))

    async def update(
        self,
        document: str | int,
        *,
        name: str | NotGiven = NOT_GIVEN,
        text: str | NotGiven = NOT_GIVEN,
        pairs: Sequence[DocumentPairParam] | NotGiven = NOT_GIVEN,
        crawl_scope: str | NotGiven = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> KnowledgeDocument:
        """Changes the name, or what each kind holds.

        What changes the content is read again.

        Args:
            name: The document's name.
            text: A text document's text.
            pairs: A questions document's pairs.
            crawl_scope: How far to read a website: this `page`, or the whole `site`.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(name=name, text=text, pairs=pairs, crawl_scope=crawl_scope)
        request = APIRequest(
            "PUT",
            "/knowledge-base/{document}",
            "safe",
            path_params={"document": str(document)},
            body=body,
            options=options,
        )
        return await self._http.request(request, read_envelope(KnowledgeDocument))

    async def refresh(
        self,
        document: str | int,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        """Reads a link document again now, or tries a file that failed again."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest(
            "POST",
            "/knowledge-base/{document}/refresh",
            "safe",
            path_params={"document": str(document)},
            options=options,
        )
        await self._http.request(request, read_nothing)

    async def delete(
        self,
        document: str | int,
        *,
        detach: bool | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        """Deletes a document.

        Args:
            detach: Take it off the agents that use it. Without this, one in use raises a conflict naming them.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query = {"detach": detach}
        request = APIRequest(
            "DELETE",
            "/knowledge-base/{document}",
            "safe",
            path_params={"document": str(document)},
            query=query,
            options=options,
        )
        await self._http.request(request, read_nothing)


class AsyncKnowledgeBaseWithRawResponse:
    """KnowledgeBase: these methods, each returning a RawResponse: the result with its status and headers."""

    def __init__(self, knowledge_base: AsyncKnowledgeBase) -> None:
        self.list = to_raw(knowledge_base.list)
        self.retrieve = to_raw(knowledge_base.retrieve)
        self.create_text = to_raw(knowledge_base.create_text)
        self.create_qa = to_raw(knowledge_base.create_qa)
        self.create_link = to_raw(knowledge_base.create_link)
        self.create_file = to_raw(knowledge_base.create_file)
        self.update = to_raw(knowledge_base.update)
        self.refresh = to_raw(knowledge_base.refresh)
        self.delete = to_raw(knowledge_base.delete)
