"""What the sync client can't share with the async one: how it waits, and how it ends an attempt that runs too long.

It is the hand-written twin of `_async/_io.py`. scripts/unasync.py writes everything else in `_sync/` from `_async/`.
"""

from __future__ import annotations

import contextlib
import time
from collections.abc import Callable, Generator

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
