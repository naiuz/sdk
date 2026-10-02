"""Streamed answers, read piece by piece as the server sends them."""

from __future__ import annotations

import codecs
import contextlib
import json
from collections.abc import AsyncIterator
from types import TracebackType
from typing import Generic, TypeVar, cast

import httpx

from .._errors import APIConnectionError, APITimeoutError, NeuronAIError, connection_error, make_api_error
from .._models import BaseModel
from .._response import Attempt
from .._streaming import MAX_DRAIN_SECONDS, SSEDecoder
from . import _io

M = TypeVar("M", bound=BaseModel)

EVENT_STREAM = "text/event-stream"
"""The media type of a stream of server-sent events."""


class AsyncStream(Generic[M]):
    """A streamed answer: loop over it for each chunk, as the server sends it.

    The request stays open while you read. Leaving the loop early, by `break`, `return` or an error, or calling
    `close()`, aborts it, and the server stops generating. Reading on to `[DONE]` lets the answer end on its own, so
    its connection can be reused. The call's timeout bounds the wait for each piece of the stream, not the whole of it.
    A stream can be read once: read it, close it, or use it in a `with` block, which closes it on the way out.
    """

    def __init__(self, response: httpx.Response, attempt: Attempt, model: type[M]) -> None:
        self._response = response
        self._attempt = attempt
        self._model = model
        self._read = False
        self._closed = False

    def __aiter__(self) -> AsyncIterator[M]:
        return self._chunks()

    async def __aenter__(self) -> AsyncStream[M]:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.close()

    async def close(self) -> None:
        """Stops the stream: the request is aborted, the server stops generating, and a loop reading the stream ends
        quietly. Calling it again does nothing."""
        self._closed = True
        await self._response.aclose()

    async def _chunks(self) -> AsyncIterator[M]:
        if self._read:
            raise NeuronAIError("This stream has already been read: a stream can be read once.")
        self._read = True
        events = SSEDecoder()
        text = codecs.getincrementaldecoder("utf-8")(errors="replace")
        pieces = self._response.aiter_bytes()
        try:
            while True:
                piece = await self._next(pieces)
                if self._closed:
                    return
                for data in events.push(text.decode(piece or b"", final=piece is None)):
                    if data == "[DONE]":
                        await _io.drain(pieces, min(self._attempt.timeout, MAX_DRAIN_SECONDS))
                        return
                    yield self._parse(data)
                    # The loop reading the stream may have closed it meanwhile.
                    if self._closed:
                        return
                if piece is None:
                    raise APIConnectionError("The stream ended before [DONE]: the answer may be cut short.")
        finally:
            self._closed = True
            await self._response.aclose()

    async def _next(self, pieces: AsyncIterator[bytes]) -> bytes | None:
        """The next piece of the body, or None at its end. httpx's read timeout, the call's timeout, bounds the wait."""
        try:
            return await anext(pieces)
        except StopAsyncIteration:
            return None
        except httpx.TimeoutException as cause:
            if self._closed:
                return None
            raise APITimeoutError(f"No part of the stream arrived within {self._attempt.timeout:g} s.") from cause
        except (httpx.RequestError, httpx.StreamError) as cause:
            if self._closed:
                return None
            raise connection_error(cause, reading=True) from cause

    def _parse(self, data: str) -> M:
        """One event's data as a chunk. An event that isn't one, such as the API's error envelope, raises APIError with
        the answer's status, 200, and the key redacted from the event."""
        with contextlib.suppress(ValueError):
            chunk: object = json.loads(data)
            if isinstance(chunk, dict) and not isinstance(cast("dict[str, object]", chunk).get("error"), dict):
                return self._model.model_validate(chunk)
        response = self._response
        raise make_api_error(response.status_code, response.reason_phrase, response.headers, self._attempt.redact(data))


def read_stream(model: type[M]) -> _io.TakeOver[AsyncStream[M]]:
    """Reads a stream of server-sent events, each a `model`: the core hands the answer over open, and the stream
    reads it. A success that isn't an event stream raises APIError, its body read within the call's timeout."""

    async def take(response: httpx.Response, attempt: Attempt) -> AsyncStream[M]:
        return AsyncStream(response, attempt, model)

    return _io.TakeOver(take, EVENT_STREAM)
