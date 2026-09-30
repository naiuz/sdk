# Written by scripts/unasync.py from src/naiuz/_async/resources/chat.py. Edit that file, then run the script.
"""Chat completions."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal

from ..._errors import NeuronAIError
from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_body
from ...types.chat import ChatCompletion, ChatMessageParam
from .._http import HttpClient
from .._io import to_raw
from .._resource import APIResource


def _refuse_a_stream(stream: object) -> None:
    """A caller without a type checker may pass `stream=True`, which this version can't read yet."""
    if stream is True:
        raise NeuronAIError("Streamed chat completions arrive in a later version of this SDK: leave stream out.")


class Completions(APIResource):
    """Chat completions."""

    @property
    def with_raw_response(self) -> CompletionsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return CompletionsWithRawResponse(self)

    def create(
        self,
        *,
        model: str,
        messages: Sequence[ChatMessageParam],
        max_tokens: int | NotGiven | None = NOT_GIVEN,
        temperature: float | NotGiven | None = NOT_GIVEN,
        top_p: float | NotGiven | None = NOT_GIVEN,
        stop: str | Sequence[str] | NotGiven | None = NOT_GIVEN,
        stream: Literal[False] | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ChatCompletion:
        """A model's response to a chat conversation, billed per token.

        `cost` is the price, from `X-Cost`. A timeout is never retried, because the call may have been charged.

        Args:
            model: The model's id, from `models.list()`.
            messages: The conversation so far, at least one message.
            max_tokens: The most tokens to generate, 1 or more.
            temperature: From 0 to 2.
            top_p: From 0 to 1.
            stop: Text at which the model stops: one string, or a list of strings. Sent exactly as given, byte for
                byte, including a string of only whitespace such as a line break.
            stream: Streamed answers arrive in a later version of this SDK; `True` raises NeuronAIError before
                anything is sent.
        """
        _refuse_a_stream(stream)
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stop=stop,
            stream=stream,
        )
        request = APIRequest("POST", "/chat/completions", "paid", body=body, options=options)
        return self._http.request(request, read_body(ChatCompletion))


class CompletionsWithRawResponse:
    """The completions' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, completions: Completions) -> None:
        self.create = to_raw(completions.create)


class Chat(APIResource):
    """Chat."""

    completions: Completions
    """Chat completions."""

    def __init__(self, http: HttpClient) -> None:
        super().__init__(http)
        self.completions = Completions(http)
