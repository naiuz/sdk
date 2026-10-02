"""Bodies that arrive over time, for the async client's tests. `tests/_sync/_io.py` is its hand-written twin."""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

import httpx

GIVE_UP = 5.0
"""Seconds after which a body that goes on forever or stalls fails the test, so a client that never cuts it off
can't hang the suite."""


class Body(httpx.AsyncByteStream):
    """A body that sends each chunk after `gap` seconds, then fails with `error`, goes on with `forever`, or stalls."""

    def __init__(
        self,
        *chunks: bytes,
        gap: float = 0.0,
        forever: bool = False,
        error: BaseException | None = None,
        stall: bool = False,
    ) -> None:
        self.chunks = chunks
        self.gap = gap
        self.forever = forever
        self.error = error
        self.stall = stall
        """Whether the body stops arriving after its chunks, without ending. The sync twin has no such body."""
        self.closed = False
        """Whether the client closed the answer."""
        self.finished = False
        """Whether the client read the body to its end."""

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self.chunks:
            await asyncio.sleep(self.gap)
            yield chunk
        started = time.monotonic()
        while self.forever:
            if time.monotonic() - started > GIVE_UP:
                raise AssertionError(f"The body dripped for {GIVE_UP:g} s: nothing cut it off.")
            await asyncio.sleep(self.gap)
            yield b" "
        if self.error is not None:
            raise self.error
        if self.stall:
            await asyncio.sleep(GIVE_UP)
            raise AssertionError(f"The body stalled for {GIVE_UP:g} s: nothing cut it off.")
        self.finished = True

    async def aclose(self) -> None:
        self.closed = True


def answer(body: Body, status: int = 200) -> httpx.Response:
    """A JSON answer whose body is `body`."""
    return httpx.Response(status, headers={"content-type": "application/json"}, stream=body)


def events(body: Body) -> httpx.Response:
    """An event stream whose body is `body`."""
    return httpx.Response(200, headers={"content-type": "text/event-stream", "x-request-id": "req-stream"}, stream=body)


async def settle() -> None:
    """Lets the event loop run what a step of the test scheduled, such as closing a loop's iterator after `break`."""
    for _ in range(5):
        await asyncio.sleep(0)


def other_kind_of_client() -> httpx.Client:
    """An httpx client of the kind the other client takes."""
    return httpx.Client()
