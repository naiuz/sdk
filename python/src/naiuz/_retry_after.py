"""How long a `Retry-After` header asks the client to wait."""

from __future__ import annotations

import math
import re
from datetime import timezone
from email.utils import parsedate_to_datetime

_SECONDS = re.compile(r"\d+(\.\d+)?")
_DAY_NAME = re.compile(r"[A-Za-z]{3}")


def parse_retry_after(value: str | None, now: float) -> float | None:
    """The seconds a `Retry-After` header asks for, or None when there is none or it can't be read.

    The header holds either seconds or an HTTP date. A date counts from `now` (Unix seconds), rounded up, and never
    below 0.
    """
    if value is None:
        return None
    text = value.strip()
    if _SECONDS.fullmatch(text):
        return float(text)
    # An HTTP date starts with the day's name, such as "Wed, 21 Oct 2026 07:28:00 GMT".
    if not _DAY_NAME.match(text):
        return None
    try:
        date = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return float(max(0, math.ceil(date.timestamp() - now)))
