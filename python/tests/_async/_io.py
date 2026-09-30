"""Bodies that arrive over time, for the async client's tests. `tests/_sync/_io.py` is its hand-written twin."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import httpx


class Body(httpx.AsyncByteStream):
    """A body that sends each chunk after `gap` seconds, then fails with `error`, or goes on forever with `forever`."""

    def __init__(self, *chunks: bytes, gap: float = 0.0, forever: bool = False, error: Exception | None = None) -> None:
        self.chunks = chunks
        self.gap = gap
        self.forever = forever
        self.error = error
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

    async def aclose(self) -> None:
        self.closed = True


def answer(body: Body, status: int = 200) -> httpx.Response:
    """A JSON answer whose body is `body`."""
    return httpx.Response(status, headers={"content-type": "application/json"}, stream=body)
