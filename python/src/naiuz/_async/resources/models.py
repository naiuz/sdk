"""The chat models available to your account."""

from __future__ import annotations

from collections.abc import Mapping

from ..._request import APIRequest, RequestOptions
from ..._response import read_body
from ...types.models import ModelList
from .._io import to_raw
from .._resource import AsyncAPIResource


class AsyncModels(AsyncAPIResource):
    """The chat models available to your account."""

    @property
    def with_raw_response(self) -> AsyncModelsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AsyncModelsWithRawResponse(self)

    async def list(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ModelList:
        """The chat models available to your account, in OpenAI's list shape."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        return await self._http.request(APIRequest("GET", "/models", "safe", options=options), read_body(ModelList))


class AsyncModelsWithRawResponse:
    """The models' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, models: AsyncModels) -> None:
        self.list = to_raw(models.list)
