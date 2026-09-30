"""How a success answer becomes a call's result, and how a result keeps its answer's status and headers."""

from __future__ import annotations

import contextlib
import json
import math
import re
from collections.abc import Callable, Generator
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar, cast

import httpx
import pydantic

from ._errors import APIError, NeuronAIError, make_api_error
from ._models import COST, REQUEST_ID, BaseModel
from ._retry import AttemptFailure

T = TypeVar("T")
M = TypeVar("M", bound=BaseModel)


@dataclass(frozen=True)
class Answer:
    """A success answer, its body read whole."""

    status: int
    reason: str
    headers: httpx.Headers
    content: bytes
    redact: Callable[[str], str]
    """Replaces every occurrence of the API key in a text that goes into an error."""

    def text(self) -> str:
        """The body as text."""
        return self.content.decode("utf-8", errors="replace")


Reader = Callable[[Answer], T]
"""Turns a success answer into the call's result, raising APIError for a body the call can't use."""


def _unusable(answer: Answer) -> APIError:
    """The error for a success answer whose body isn't what the call returns, with the API key redacted from it."""
    return make_api_error(answer.status, answer.reason, answer.headers, answer.redact(answer.text()))


def _json_object(answer: Answer) -> dict[str, Any] | None:
    try:
        body: object = json.loads(answer.content)
    except ValueError:
        return None
    return cast("dict[str, Any]", body) if isinstance(body, dict) else None


def _validate(model: type[M], data: object, context: dict[str, object], answer: Answer) -> M:
    with contextlib.suppress(pydantic.ValidationError):
        return model.model_validate(data, context=context)
    # Raised once the validation error is gone, since that error quotes the body.
    raise _unusable(answer)


def request_id_of(body: dict[str, Any], headers: httpx.Headers) -> str | None:
    """The request's ID: the body's `request_id`, else the `X-Request-Id` header, else None."""
    request_id = body.get("request_id")
    return request_id if isinstance(request_id, str) else headers.get("x-request-id")


_NUMBER = re.compile(r"[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?")


def number_header(headers: httpx.Headers, name: str) -> float | None:
    """A header as a number, or None when it is absent or isn't a finite number."""
    text = (headers.get(name) or "").strip()
    value = float(text) if _NUMBER.fullmatch(text) else math.nan
    return value if math.isfinite(value) else None


def read_envelope(model: type[M]) -> Reader[M]:
    """Reads a `{data, request_id}` answer: its `data` object as `model`, with the request's ID attached."""

    def read(answer: Answer) -> M:
        body = _json_object(answer)
        if body is None or not isinstance(body.get("data"), dict):
            raise _unusable(answer)
        return _validate(model, body["data"], {REQUEST_ID: request_id_of(body, answer.headers)}, answer)

    return read


def read_body(model: type[M]) -> Reader[M]:
    """Reads a compatible endpoint's answer: the body as `model`, with its price attached from `X-Cost` when sent."""

    def read(answer: Answer) -> M:
        body = _json_object(answer)
        if body is None:
            raise _unusable(answer)
        return _validate(model, body, {COST: number_header(answer.headers, "x-cost")}, answer)

    return read


@dataclass(frozen=True)
class PageData(Generic[M]):
    """What one page of a list holds."""

    items: list[M]
    next_cursor: str | None
    request_id: str | None


def read_page(model: type[M]) -> Reader[PageData[M]]:
    """Reads a `{data: [...], next_cursor, request_id}` answer, each item as `model`."""

    def read(answer: Answer) -> PageData[M]:
        body = _json_object(answer)
        data: object = None if body is None else body.get("data")
        if body is None or not isinstance(data, list):
            raise _unusable(answer)
        items = [_validate(model, item, {}, answer) for item in cast("list[object]", data)]
        next_cursor = body.get("next_cursor")
        cursor = next_cursor if isinstance(next_cursor, str) else None
        return PageData(items, cursor, request_id_of(body, answer.headers))

    return read


def read_nothing(answer: Answer) -> None:
    """Reads a 204 answer: nothing."""


@dataclass(frozen=True)
class Answered(Generic[T]):
    """An attempt that got its result."""

    value: T
    status: int
    headers: httpx.Headers


@dataclass(frozen=True)
class Failed:
    """An attempt that failed: the error to raise, why, and the seconds a `Retry-After` asked for."""

    error: NeuronAIError
    failure: AttemptFailure
    retry_after: float | None


@dataclass(frozen=True)
class RawResponse(Generic[T]):
    """A call's result, with the status and headers of the answer it came from."""

    data: T
    """What the call returns without `with_raw_response`."""
    status: int
    """The answer's HTTP status."""
    headers: httpx.Headers
    """The answer's headers."""


@dataclass
class Captured:
    """The status and headers of the answer a call took its result from."""

    status: int = 0
    headers: httpx.Headers = field(default_factory=httpx.Headers)


_captured: ContextVar[Captured | None] = ContextVar("naiuz_captured", default=None)


@contextlib.contextmanager
def capture() -> Generator[Captured, None, None]:
    """Records the status and headers of the answers calls in this block take their results from; the last one wins."""
    captured = Captured()
    token = _captured.set(captured)
    try:
        yield captured
    finally:
        _captured.reset(token)


def record(status: int, headers: httpx.Headers) -> None:
    """Records an answer a call takes its result from, when a `capture()` block is open."""
    captured = _captured.get()
    if captured is not None:
        captured.status = status
        captured.headers = headers
