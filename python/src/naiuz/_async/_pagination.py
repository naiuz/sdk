"""Pages of a list: one page, and every page after it."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace
from typing import TYPE_CHECKING, Generic, TypeVar

from .._errors import NeuronAIError
from .._models import BaseModel
from .._request import APIRequest
from .._response import PageData, read_page

if TYPE_CHECKING:
    from ._http import AsyncHttpClient

M = TypeVar("M", bound=BaseModel)


class AsyncPage(Generic[M]):
    """One page of a list. Loop over it for its items and every page's after it, each page fetched when reached."""

    data: list[M]
    """This page's items."""
    next_cursor: str | None
    """Pass it as `cursor` for the next page; None on the last page. Cursors are opaque: don't build or change them."""
    request_id: str | None
    """The request's ID, to quote to support: the answer's `request_id`, else its `X-Request-Id` header."""

    def __init__(self, http: AsyncHttpClient, request: APIRequest, model: type[M], page: PageData[M]) -> None:
        self.data = page.items
        self.next_cursor = page.next_cursor
        self.request_id = page.request_id
        self._http = http
        self._request = request
        self._model = model

    def has_next_page(self) -> bool:
        """Whether another page follows this one."""
        return bool(self.next_cursor)

    async def next_page(self) -> AsyncPage[M]:
        """The page after this one, with the same query and options. On the last page it raises NeuronAIError."""
        if not self.next_cursor:
            raise NeuronAIError("This is the last page: check has_next_page() before calling next_page().")
        request = replace(self._request, query={**self._request.query, "cursor": self.next_cursor})
        return await fetch_page(self._http, request, self._model)

    async def __aiter__(self) -> AsyncIterator[M]:
        page = self
        while True:
            for item in page.data:
                yield item
            if not page.has_next_page():
                return
            page = await page.next_page()

    def __repr__(self) -> str:
        fields = f"data={self.data!r}, next_cursor={self.next_cursor!r}, request_id={self.request_id!r}"
        return f"{type(self).__name__}({fields})"


async def fetch_page(http: AsyncHttpClient, request: APIRequest, model: type[M]) -> AsyncPage[M]:
    """Sends a list call, and returns its page."""
    return AsyncPage(http, request, model, await http.request(request, read_page(model)))
