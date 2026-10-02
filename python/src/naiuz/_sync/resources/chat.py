# Written by scripts/unasync.py from src/naiuz/_async/resources/chat.py. Edit that file, then run the script.
"""Chat completions."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace
from typing import Literal, overload

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_body
from ...types.chat import ChatCompletion, ChatCompletionChunk, ChatMessageParam
from .._http import HttpClient
from .._io import to_raw
from .._resource import APIResource
from .._streaming import Stream, read_stream

EVENTS = "text/event-stream, application/json"
"""What a streamed call accepts: the event stream, or an error in the API's JSON envelope."""


class Completions(APIResource):
    """Chat completions."""

    @property
    def with_raw_response(self) -> CompletionsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return CompletionsWithRawResponse(self)

    @overload
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
    ) -> ChatCompletion: ...

    @overload
    def create(
        self,
        *,
        model: str,
        messages: Sequence[ChatMessageParam],
        max_tokens: int | NotGiven | None = NOT_GIVEN,
        temperature: float | NotGiven | None = NOT_GIVEN,
        top_p: float | NotGiven | None = NOT_GIVEN,
        stop: str | Sequence[str] | NotGiven | None = NOT_GIVEN,
        stream: Literal[True],
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Stream[ChatCompletionChunk]: ...

    @overload
    def create(
        self,
        *,
        model: str,
        messages: Sequence[ChatMessageParam],
        max_tokens: int | NotGiven | None = NOT_GIVEN,
        temperature: float | NotGiven | None = NOT_GIVEN,
        top_p: float | NotGiven | None = NOT_GIVEN,
        stop: str | Sequence[str] | NotGiven | None = NOT_GIVEN,
        stream: bool | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ChatCompletion | Stream[ChatCompletionChunk]: ...

    def create(
        self,
        *,
        model: str,
        messages: Sequence[ChatMessageParam],
        max_tokens: int | NotGiven | None = NOT_GIVEN,
        temperature: float | NotGiven | None = NOT_GIVEN,
        top_p: float | NotGiven | None = NOT_GIVEN,
        stop: str | Sequence[str] | NotGiven | None = NOT_GIVEN,
        stream: bool | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ChatCompletion | Stream[ChatCompletionChunk]:
        """A model's response to a chat conversation, billed per token.

        `cost` is the price, from `X-Cost`. A timeout is never retried, because the call may have been charged.

        With `stream=True`, the answer comes as it is generated: the call returns a stream once the answer starts, and
        a loop over it gives each ChatCompletionChunk. The last chunk carries `usage` when the model reports its token
        counts. The timeout bounds the wait for each piece of the stream, not the whole of it. A failure once the
        stream has started comes from the loop as an APIError with status 200 and its code, such as `upstream_error`.
        A stream is billed when it ends, so it has no `cost`; it is retried like any completion before it starts, and
        never once it has.

        Args:
            model: The model's id, from `models.list()`.
            messages: The conversation so far, at least one message.
            max_tokens: The most tokens to generate, 1 or more.
            temperature: From 0 to 2.
            top_p: From 0 to 1.
            stop: Text at which the model stops: one string, or a list of strings. Sent exactly as given, byte for
                byte, including a string of only whitespace such as a line break.
            stream: True streams the answer as it is generated.
        """
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
        if stream is True:
            return self._http.request(replace(request, accept=EVENTS), read_stream(ChatCompletionChunk))
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
