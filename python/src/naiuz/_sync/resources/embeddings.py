# Written by scripts/unasync.py from src/naiuz/_async/resources/embeddings.py. Edit that file, then run the script.
"""Dense vectors for text."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_body
from ...types.embeddings import EmbeddingResponse
from .._io import to_raw
from .._resource import APIResource


class Embeddings(APIResource):
    """Dense vectors for text."""

    @property
    def with_raw_response(self) -> EmbeddingsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return EmbeddingsWithRawResponse(self)

    def create(
        self,
        *,
        model: str,
        input: str | Sequence[str],
        encoding_format: Literal["float"] | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> EmbeddingResponse:
        """A 1024-dimensional vector per input, billed per input token.

        `cost` is the price, from `X-Cost`. A timeout is never retried, because the call may have been charged.

        Args:
            model: The embedding model's id.
            input: The text to embed: one string, or a list of strings for a batch.
            encoding_format: Only float vectors are served; base64 is an OpenAI option the API does not support.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(model=model, input=input, encoding_format=encoding_format)
        request = APIRequest("POST", "/embeddings", "paid", body=body, options=options)
        return self._http.request(request, read_body(EmbeddingResponse))


class EmbeddingsWithRawResponse:
    """The embeddings' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, embeddings: Embeddings) -> None:
        self.create = to_raw(embeddings.create)
