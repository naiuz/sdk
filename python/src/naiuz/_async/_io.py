"""What the async client can't share with the sync one: how it waits, and how it ends an attempt that runs too long.

`_sync/_io.py` is its hand-written twin. scripts/unasync.py writes everything else in `_sync/` from `_async/`.
"""

from __future__ import annotations

import asyncio
import contextlib
import sys
from collections.abc import AsyncGenerator, Awaitable, Callable

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
