"""The body of every error answer."""

from __future__ import annotations

from typing import Literal

from .._models import BaseModel

ErrorType = Literal["invalid_request_error", "insufficient_quota", "rate_limit_error", "server_error"]
"""`insufficient_quota` for 402, `rate_limit_error` for 429, `server_error` for 5xx, and `invalid_request_error` for
every other 4xx."""


class ErrorDetail(BaseModel):
    """What went wrong."""

    type: ErrorType | str
    """`insufficient_quota` for 402, `rate_limit_error` for 429, `server_error` for 5xx, and `invalid_request_error`
    for every other 4xx."""
    code: str
    """A stable, machine-readable code (see ErrorCode). Match on it, never on `message`."""
    message: str
    """What went wrong, written for people."""
    param: str | None
    """The first invalid parameter, or None."""
    fields: dict[str, str] | None = None
    """Validation errors only: each invalid field and its first message."""


class ErrorEnvelope(BaseModel):
    """The body of every error answer. The SDK raises it as an APIError, which carries the same details."""

    error: ErrorDetail
    """What went wrong."""
    request_id: str
    """The same ID as the `X-Request-Id` header."""
