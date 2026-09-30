"""Every error this SDK raises, and how an answer it can't use becomes one."""

from __future__ import annotations

import json
import time
from typing import NamedTuple, cast

import httpx

from ._retry_after import parse_retry_after


class NeuronAIError(Exception):
    """The base of every error this SDK raises."""


class APIConnectionError(NeuronAIError):
    """The API couldn't be reached, or the connection failed before a whole answer arrived.

    DNS, TLS, or a refused, reset or dropped connection. `__cause__` holds the error from the HTTP layer.
    """

    def __init__(self, message: str = "Connection error.") -> None:
        super().__init__(message)


class APITimeoutError(APIConnectionError):
    """An attempt took longer than its timeout, reading the answer included."""

    def __init__(self, message: str = "Request timed out.") -> None:
        super().__init__(message)


class APIError(NeuronAIError):
    """The API answered with an error. A status with its own class raises that class; any other raises APIError."""

    message: str
    """What went wrong, written for people. Match on `code`, never on the message."""
    status: int
    """The HTTP status."""
    type: str | None
    """`invalid_request_error`, `insufficient_quota`, `rate_limit_error` or `server_error`; None outside the
    API's error envelope."""
    code: str | None
    """A stable, machine-readable code, such as `insufficient_balance` (see ErrorCode). None outside the envelope."""
    param: str | None
    """The first invalid parameter, or None."""
    fields: dict[str, str] | None
    """Validation errors only: each invalid field and its first message. None otherwise."""
    request_id: str | None
    """The request's ID, to quote to support: the envelope's `request_id`, else the `X-Request-Id` header, else
    None."""
    headers: httpx.Headers
    """The answer's headers."""

    def __init__(
        self,
        message: str,
        *,
        status: int,
        type: str | None = None,
        code: str | None = None,
        param: str | None = None,
        fields: dict[str, str] | None = None,
        request_id: str | None = None,
        headers: httpx.Headers | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.type = type
        self.code = code
        self.param = param
        self.fields = fields
        self.request_id = request_id
        self.headers = httpx.Headers() if headers is None else headers


class BadRequestError(APIError):
    """400: the request is malformed."""


class AuthenticationError(APIError):
    """401: the API key is missing, unknown, disabled, revoked or expired."""


class InsufficientQuotaError(APIError):
    """402: the balance is too low, or the key's monthly spend limit would be passed."""


class PermissionDeniedError(APIError):
    """403: the key may not do this, from this address, or with this voice."""


class NotFoundError(APIError):
    """404: no such route or resource in this organization."""


class ConflictError(APIError):
    """409: the request conflicts with the resource's state, or reuses an Idempotency-Key with another body."""


class GoneError(APIError):
    """410: the resource is gone, such as a job's audio past its retention window."""


class PayloadTooLargeError(APIError):
    """413: the request is larger than the server accepts."""


class UnsupportedMediaTypeError(APIError):
    """415: the uploaded media type is not supported."""


class UnprocessableEntityError(APIError):
    """422: the request failed validation. `fields` maps each invalid field to its first message."""


class RateLimitError(APIError):
    """429: too many requests."""

    retry_after: float | None
    """The seconds the `Retry-After` header asks for (an HTTP date counts from now), or None when there is none."""

    def __init__(
        self,
        message: str,
        *,
        status: int,
        type: str | None = None,
        code: str | None = None,
        param: str | None = None,
        fields: dict[str, str] | None = None,
        request_id: str | None = None,
        headers: httpx.Headers | None = None,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(
            message,
            status=status,
            type=type,
            code=code,
            param=param,
            fields=fields,
            request_id=request_id,
            headers=headers,
        )
        self.retry_after = retry_after


class InternalServerError(APIError):
    """A status of 500 or above: the server failed."""


_CLASS_BY_STATUS: dict[int, type[APIError]] = {
    400: BadRequestError,
    401: AuthenticationError,
    402: InsufficientQuotaError,
    403: PermissionDeniedError,
    404: NotFoundError,
    409: ConflictError,
    410: GoneError,
    413: PayloadTooLargeError,
    415: UnsupportedMediaTypeError,
    422: UnprocessableEntityError,
}


class _Details(NamedTuple):
    message: str
    type: str | None
    code: str | None
    param: str | None
    fields: dict[str, str] | None
    request_id: str | None


def _text(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _from_envelope(headers: httpx.Headers, body: str) -> _Details | None:
    try:
        parsed: object = json.loads(body)
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    envelope = cast("dict[str, object]", parsed)
    error = envelope.get("error")
    if not isinstance(error, dict):
        return None
    details = cast("dict[str, object]", error)
    message = details.get("message")
    if not isinstance(message, str):
        return None
    listed = details.get("fields")
    fields = None
    if isinstance(listed, dict):
        fields = {name: text for name, text in cast("dict[str, object]", listed).items() if isinstance(text, str)}
    request_id = _text(envelope.get("request_id")) or headers.get("x-request-id")
    return _Details(
        message, _text(details.get("type")), _text(details.get("code")), _text(details.get("param")), fields, request_id
    )


def _outside_envelope(status: int, reason: str, headers: httpx.Headers, body: str) -> _Details:
    # HTTP/2 has no reason phrase, so fall back to the number.
    head = reason.strip() or f"HTTP {status}"
    snippet = body[:200].strip()
    return _Details(f"{head}: {snippet}" if snippet else head, None, None, None, None, headers.get("x-request-id"))


def make_api_error(status: int, reason: str, headers: httpx.Headers, body: str, now: float | None = None) -> APIError:
    """The error for an answer the SDK can't use: an error status, or a success whose body isn't what the call returns.

    The API's envelope fills in `type`, `code`, `message`, `param` and `fields`. Anything else, such as a proxy's HTML
    page, leaves `type` and `code` None, and the message is the reason phrase, then the first 200 characters of the
    body, trimmed. `now` (Unix seconds) is when a 429's `Retry-After` date counts from.
    """
    details = _from_envelope(headers, body) or _outside_envelope(status, reason, headers, body)
    message, error_type, code, param, fields, request_id = details
    if status == 429:
        retry_after = parse_retry_after(headers.get("retry-after"), time.time() if now is None else now)
        return RateLimitError(
            message,
            status=status,
            type=error_type,
            code=code,
            param=param,
            fields=fields,
            request_id=request_id,
            headers=headers,
            retry_after=retry_after,
        )
    error_class = InternalServerError if status >= 500 else _CLASS_BY_STATUS.get(status, APIError)
    return error_class(
        message,
        status=status,
        type=error_type,
        code=code,
        param=param,
        fields=fields,
        request_id=request_id,
        headers=headers,
    )


_MAX_DEPTH = 5
"""How deep root_message follows causes, so a chain that loops back on itself can't hang it."""


def root_message(error: BaseException, depth: int = 0) -> str:
    """The deepest non-empty message in the error's chain of causes.

    When an error's own message is empty and it groups other errors, as an ExceptionGroup does, the first non-empty
    message among them is used instead.
    """
    message = str(error)
    if depth >= _MAX_DEPTH:
        return message
    grouped: object = getattr(error, "exceptions", None)
    if message == "" and isinstance(grouped, tuple):
        for inner in cast("tuple[object, ...]", grouped):
            if isinstance(inner, BaseException) and (found := root_message(inner, depth + 1)):
                return found
    cause = error.__cause__ or error.__context__
    if cause is not None and (deeper := root_message(cause, depth + 1)):
        return deeper
    return message


def connection_error(cause: BaseException, *, reading: bool) -> APIConnectionError:
    """The error for a connection that failed, saying what failed and keeping `cause` as its `__cause__`.

    `reading` says the failure came once the answer had started to arrive.
    """
    reason = root_message(cause)
    head = "The connection failed while the response arrived" if reading else "Connection error"
    error = APIConnectionError(f"{head}: {reason}" if reason else f"{head}.")
    error.__cause__ = cause
    return error
