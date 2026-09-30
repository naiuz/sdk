"""Which failures a call may retry, and how long it waits before trying again."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import httpx

RetryClass = Literal["safe", "idempotent", "paid", "recreate", "once"]
"""Which failures a call may retry, as the spec's retry table gives them.

Every class retries a 429, and a connection error raised before the request was sent. Beyond that:
- `safe`: GET, DELETE, api_keys.update and api_keys.revoke. Also 500, 502, 503 and 504, and a timeout or a connection
  error after sending.
- `idempotent`: the five POSTs that send an Idempotency-Key. Also any 5xx, and a timeout or a connection error after
  sending.
- `paid`: chat completions, embeddings and rerank. Also a 5xx that carries the API's own error envelope, but not a bare
  page from a proxy or gateway, and not a timeout or a connection error once the request was sent: the call may have
  completed and been charged.
- `recreate`: voices.update and voices.replace_audio. Also a 5xx that carries the API's own error envelope, but not a
  bare gateway page, and not after sending, since either may still be re-creating the voice.
- `once`: api_keys.create. Nothing more, since a retry could create a second key.
"""


@dataclass(frozen=True)
class StatusFailure:
    """The API answered with an error status."""

    status: int
    enveloped: bool
    """Whether the body was the API's own error envelope (its `code` was set). A 5xx without one is a proxy's or
    gateway's own page, not the API."""


@dataclass(frozen=True)
class TimeoutFailure:
    """The attempt ran out of time after the request may have been sent."""


@dataclass(frozen=True)
class ConnectionFailure:
    """The connection failed."""

    before_send: bool
    """Whether the request surely never reached the server."""


AttemptFailure = StatusFailure | TimeoutFailure | ConnectionFailure
"""Why an attempt failed."""


def is_retryable(retry: RetryClass, failure: AttemptFailure) -> bool:
    """Whether a call of this class may try again after this failure."""
    after_sending = retry in ("safe", "idempotent")
    if isinstance(failure, StatusFailure):
        if failure.status == 429:
            return True
        if retry == "safe":
            return failure.status in (500, 502, 503, 504)
        if retry == "once" or failure.status < 500:
            return False
        # A bare 5xx from a proxy or gateway may mean the server is still working: paid and recreate calls retry it
        # only when it carries the API's own error envelope.
        return retry == "idempotent" or failure.enveloped
    if isinstance(failure, TimeoutFailure):
        return after_sending
    return failure.before_send or after_sending


MAX_RETRY_AFTER_SECONDS = 60.0
"""The longest `Retry-After` the SDK waits, in seconds. A longer one, such as a maintenance window's, raises at once."""


def retry_delay(retry: int, retry_after: float | None, random: Callable[[], float]) -> float | None:
    """Seconds to wait before retry number `retry` (0 for the first), or None to not retry at all.

    The server's Retry-After when it sent one, else 0.5 s x 2^retry plus up to 25% jitter, capped at 8 s. None means
    the server asked for more than MAX_RETRY_AFTER_SECONDS.
    """
    if retry_after is not None:
        return None if retry_after > MAX_RETRY_AFTER_SECONDS else retry_after
    # 2^5 already passes the cap, so a larger exponent can't overflow a float.
    return min(8.0, 0.5 * 2.0 ** min(retry, 5) * (1 + 0.25 * random()))


def failed_before_sending(error: Exception) -> bool:
    """Whether a failure of the HTTP layer surely came before the request was sent.

    No connection could be made (ConnectError), connecting ran out of time (ConnectTimeout), or no pooled connection
    came free (PoolTimeout). Any other failure may have reached the server.
    """
    return isinstance(error, httpx.ConnectError | httpx.ConnectTimeout | httpx.PoolTimeout)
