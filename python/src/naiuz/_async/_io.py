"""What the async client can't share with the sync one: how it waits, and how it ends an attempt that runs too long.

`_sync/_io.py` is its hand-written twin. scripts/unasync.py writes everything else in `_sync/` from `_async/`.
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import sys
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable, Generator
from typing import TYPE_CHECKING, Any, Generic, ParamSpec, TypeVar, final

import httpx

from .._models import BaseModel
from .._request import APIRequest
from .._response import Attempt, RawResponse, capture
from ._pagination import AsyncPage, fetch_page

if TYPE_CHECKING:
    from ._http import AsyncHttpClient

T = TypeVar("T")
M = TypeVar("M", bound=BaseModel)
P = ParamSpec("P")

Sleep = Callable[[float], Awaitable[None]]
"""Waits the given number of seconds."""


async def sleep(seconds: float) -> None:
    """Waits between attempts. Cancelling the call's task cuts the wait short."""
    await asyncio.sleep(seconds)


class Deadline:
    """The deadline of one attempt."""

    def __init__(self, disarm: Callable[[], None]) -> None:
        self._disarm = disarm

    def disarm(self) -> None:
        """Lets the attempt run on past its deadline."""
        self._disarm()


def _nothing() -> None:
    """There is nothing to disarm."""


@contextlib.asynccontextmanager
async def deadline(seconds: float) -> AsyncGenerator[Deadline, None]:
    """Ends the attempt with TimeoutError once `seconds` have passed, wherever it waits (from Python 3.11).

    Python 3.10 has no way to end it there. On it, as in the sync client, the core stops reading an answer once its
    time is up, and httpx's own timeouts, set to the same seconds, drop a connection that goes silent.
    """
    if sys.version_info >= (3, 11):
        async with asyncio.timeout(seconds) as timeout:
            yield Deadline(lambda: timeout.reschedule(None))
    else:
        yield Deadline(_nothing)


async def within(seconds: float, call: Awaitable[T]) -> T:
    """Awaits `call`, and abandons it with TimeoutError once `seconds` have passed, as a wait abandons a poll still in
    flight at its deadline. Cancelling it cancels the call, which closes the call's answer."""
    if sys.version_info >= (3, 11):
        async with asyncio.timeout(seconds):
            return await call
    try:
        return await asyncio.wait_for(call, seconds)
    except asyncio.TimeoutError:
        # Before Python 3.11, asyncio's TimeoutError isn't the builtin one.
        raise TimeoutError from None


@final
class TakeOver(Generic[T]):
    """A reader that takes the open answer over, instead of the core reading its whole body, as a stream does.

    `take` gets the answer with its body unread, and the attempt's deadline no longer runs. Once `take` returns, the
    answer is the reader's to close; if `take` raises, the core closes it.
    """

    def __init__(self, take: Callable[[httpx.Response, Attempt], Awaitable[T]]) -> None:
        self.take = take


class AsyncPaginator(Generic[M]):
    """What a list method returns: await it for the first page, or loop over it with `async for` for every item.

    The loop walks every page, each fetched when the loop reaches it. The call is sent when awaited or looped over.
    """

    def __init__(self, http: AsyncHttpClient, request: APIRequest, model: type[M]) -> None:
        self._http = http
        self._request = request
        self._model = model

    def __await__(self) -> Generator[Any, None, AsyncPage[M]]:
        return fetch_page(self._http, self._request, self._model).__await__()

    async def __aiter__(self) -> AsyncIterator[M]:
        async for item in await self:
            yield item


def paginate(http: AsyncHttpClient, request: APIRequest, model: type[M]) -> AsyncPaginator[M]:
    """A list call, sent when awaited or looped over."""
    return AsyncPaginator(http, request, model)


def to_raw(method: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[RawResponse[T]]]:
    """The method, returning a RawResponse: its result with the status and headers of the answer it came from."""

    @functools.wraps(method)
    async def raw(*args: P.args, **kwargs: P.kwargs) -> RawResponse[T]:
        with capture() as answer:
            data = await method(*args, **kwargs)
        return RawResponse(data, answer.status, answer.headers)

    return raw
