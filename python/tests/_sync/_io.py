"""Bodies that arrive over time, for the sync client's tests. It is the hand-written twin of `tests/_async/_io.py`."""

from __future__ import annotations

import time
from collections.abc import Iterator

import httpx

GIVE_UP = 5.0
"""Seconds after which a body that goes on forever fails the test, so a client that never cuts it off can't hang
the suite."""


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
        self.finished = False
        """Whether the client read the body to its end."""

    def __iter__(self) -> Iterator[bytes]:
        for chunk in self.chunks:
            time.sleep(self.gap)
            yield chunk
        started = time.monotonic()
        while self.forever:
            if time.monotonic() - started > GIVE_UP:
                raise AssertionError(f"The body dripped for {GIVE_UP:g} s: nothing cut it off.")
            time.sleep(self.gap)
            yield b" "
        if self.error is not None:
            raise self.error
        self.finished = True

    def close(self) -> None:
        self.closed = True


def answer(body: Body, status: int = 200) -> httpx.Response:
    """A JSON answer whose body is `body`."""
    return httpx.Response(status, headers={"content-type": "application/json"}, stream=body)


def events(body: Body) -> httpx.Response:
    """An event stream whose body is `body`."""
    return httpx.Response(200, headers={"content-type": "text/event-stream", "x-request-id": "req-stream"}, stream=body)


def settle() -> None:
    """Nothing to let run: the sync client closes a loop's iterator at `break`, as the loop drops it."""


def other_kind_of_client() -> httpx.AsyncClient:
    """An httpx client of the kind the other client takes."""
    return httpx.AsyncClient()
