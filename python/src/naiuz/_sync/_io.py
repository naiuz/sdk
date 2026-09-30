"""What the sync client can't share with the async one: how it waits, and how it ends an attempt that runs too long.

It is the hand-written twin of `_async/_io.py`. scripts/unasync.py writes everything else in `_sync/` from `_async/`.
"""

from __future__ import annotations

import contextlib
import functools
import time
from collections.abc import Callable, Generator
from typing import TYPE_CHECKING, Generic, ParamSpec, TypeVar, final

import httpx

from .._models import BaseModel
from .._request import APIRequest
from .._response import Attempt, RawResponse, capture
from ._pagination import Page as Page
from ._pagination import fetch_page

if TYPE_CHECKING:
    from ._http import HttpClient

T = TypeVar("T")
M = TypeVar("M", bound=BaseModel)
P = ParamSpec("P")

Sleep = Callable[[float], None]
"""Waits the given number of seconds."""


def sleep(seconds: float) -> None:
    """Waits between attempts."""
    time.sleep(seconds)


class Deadline:
    """The deadline of one attempt."""

    def __init__(self, disarm: Callable[[], None]) -> None:
        self._disarm = disarm

    def disarm(self) -> None:
        """Lets the attempt run on past its deadline."""
        self._disarm()


def _nothing() -> None:
    """There is nothing to disarm."""


@contextlib.contextmanager
def deadline(seconds: float) -> Generator[Deadline, None, None]:
    """Can't end the attempt itself, since a blocking read can't be interrupted.

    The core stops reading an answer once its time is up instead, and httpx's own timeouts, set to the same seconds,
    drop a connection that goes silent.
    """
    yield Deadline(_nothing)


@final
class TakeOver(Generic[T]):
    """A reader that takes the open answer over, instead of the core reading its whole body, as a stream does.

    `take` gets the answer with its body unread, and the attempt's deadline no longer runs. Once `take` returns, the
    answer is the reader's to close; if `take` raises, the core closes it.
    """

    def __init__(self, take: Callable[[httpx.Response, Attempt], T]) -> None:
        self.take = take


def paginate(http: HttpClient, request: APIRequest, model: type[M]) -> Page[M]:
    """A list call, sent at once: its first page. The async client's twin is sent when awaited or looped over."""
    return fetch_page(http, request, model)


def to_raw(method: Callable[P, T]) -> Callable[P, RawResponse[T]]:
    """The method, returning a RawResponse: its result with the status and headers of the answer it came from."""

    @functools.wraps(method)
    def raw(*args: P.args, **kwargs: P.kwargs) -> RawResponse[T]:
        with capture() as answer:
            data = method(*args, **kwargs)
        return RawResponse(data, answer.status, answer.headers)

    return raw
