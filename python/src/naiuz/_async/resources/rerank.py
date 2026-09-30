"""Ranking documents against a query."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_body
from ...types.rerank import RerankResponse
from .._io import to_raw
from .._resource import AsyncAPIResource


class AsyncRerank(AsyncAPIResource):
    """Ranking documents against a query."""

    @property
    def with_raw_response(self) -> AsyncRerankWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AsyncRerankWithRawResponse(self)

    async def create(
        self,
        *,
        model: str,
        query: str,
        documents: Sequence[str],
        top_n: int | NotGiven | None = NOT_GIVEN,
        return_documents: bool | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> RerankResponse:
        """Scores each document against the query, and returns them by relevance, highest first.

        Billed per token across the query and all documents. `cost` is the price, from `X-Cost`. A timeout is never
        retried, because the call may have been charged.

        Args:
            model: The rerank model's id.
            query: The query to rank the documents against.
            documents: The documents, at least one.
            top_n: How many of the best documents to return, 1 or more.
            return_documents: False leaves out each result's `document`.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(model=model, query=query, documents=documents, top_n=top_n, return_documents=return_documents)
        request = APIRequest("POST", "/rerank", "paid", body=body, options=options)
        return await self._http.request(request, read_body(RerankResponse))


class AsyncRerankWithRawResponse:
    """The rerank's methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, rerank: AsyncRerank) -> None:
        self.create = to_raw(rerank.create)
