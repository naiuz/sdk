"""Bodies that arrive over time, for the async client's tests. `tests/_sync/_io.py` is its hand-written twin."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import httpx


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

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self.chunks:
            await asyncio.sleep(self.gap)
            yield chunk
        while self.forever:
            await asyncio.sleep(self.gap)
            yield b" "
        if self.error is not None:
            raise self.error
        if self.stall:
            await asyncio.Event().wait()

    async def aclose(self) -> None:
        self.closed = True


def answer(body: Body, status: int = 200) -> httpx.Response:
    """A JSON answer whose body is `body`."""
    return httpx.Response(status, headers={"content-type": "application/json"}, stream=body)
