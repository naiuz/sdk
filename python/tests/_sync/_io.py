"""Bodies that arrive over time, for the sync client's tests. It is the hand-written twin of `tests/_async/_io.py`."""

from __future__ import annotations

import time
from collections.abc import Iterator

import httpx


class Body(httpx.SyncByteStream):
    """A body that sends each chunk after `gap` seconds, then fails with `error`, or goes on forever with `forever`."""

    def __init__(
        self, *chunks: bytes, gap: float = 0.0, forever: bool = False, error: BaseException | None = None
    ) -> None:
        self.chunks = chunks
        self.gap = gap
        self.forever = forever
        self.error = error
        self.closed = False
        """Whether the client closed the answer."""

    def __iter__(self) -> Iterator[bytes]:
        for chunk in self.chunks:
            time.sleep(self.gap)
            yield chunk
        while self.forever:
            time.sleep(self.gap)
            yield b" "
        if self.error is not None:
            raise self.error

    def close(self) -> None:
        self.closed = True


def answer(body: Body, status: int = 200) -> httpx.Response:
    """A JSON answer whose body is `body`."""
    return httpx.Response(status, headers={"content-type": "application/json"}, stream=body)
