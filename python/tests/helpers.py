"""What the unit tests build their answers from."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from datetime import datetime, timezone

import httpx

KEY = "nai_unit_test_key"
"""The key every unit test's client sends."""

BASE_URL = "https://my.neuronai.uz/api/v1"

NOW = datetime(2026, 9, 29, 10, 0, 0, tzinfo=timezone.utc).timestamp()
"""The clock unit tests run at: Tue, 29 Sep 2026 10:00:00 GMT."""

UUID_V4 = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")

Reply = httpx.Response | Exception | Callable[[httpx.Request], httpx.Response]
"""How the mock answers one request: an answer, an error to raise, or a function of the request."""


class MockAPI:
    """Answers the n-th request with the n-th reply, and records every request."""

    def __init__(self, *replies: Reply) -> None:
        self.replies = list(replies)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if len(self.requests) > len(self.replies):
            raise AssertionError(f"Unexpected request {len(self.requests)}: {request.method} {request.url}")
        reply = self.replies[len(self.requests) - 1]
        if isinstance(reply, Exception):
            raise reply
        return reply if isinstance(reply, httpx.Response) else reply(request)

    def transport(self) -> httpx.MockTransport:
        """The transport to give an httpx client."""
        return httpx.MockTransport(self)


def json_response(status: int, body: object, headers: dict[str, str] | None = None) -> httpx.Response:
    """A JSON answer."""
    return httpx.Response(
        status, content=json.dumps(body).encode(), headers={"content-type": "application/json", **(headers or {})}
    )


def envelope(data: object, request_id: str = "req-1", status: int = 200) -> httpx.Response:
    """A `{data, request_id}` answer, with the same ID in X-Request-Id."""
    return json_response(status, {"data": data, "request_id": request_id}, {"x-request-id": request_id})


def api_error(status: int, code: str, headers: dict[str, str] | None = None) -> httpx.Response:
    """An error answer in the API's envelope."""
    kinds = {402: "insufficient_quota", 429: "rate_limit_error"}
    error_type = kinds.get(status, "server_error" if status >= 500 else "invalid_request_error")
    error = {"type": error_type, "code": code, "message": f"The {code} message.", "param": None}
    return json_response(
        status, {"error": error, "request_id": "req-error"}, {"x-request-id": "req-error", **(headers or {})}
    )


def no_content(headers: dict[str, str] | None = None) -> httpx.Response:
    """A 204 answer."""
    return httpx.Response(204, headers=headers)


def refused() -> httpx.ConnectError:
    """A failure before anything was sent: the connection was refused."""
    return httpx.ConnectError("[Errno 111] Connection refused")


def reset() -> httpx.ReadError:
    """A failure after the request went out: the connection was reset."""
    return httpx.ReadError("[Errno 104] Connection reset by peer")


def body_of(request: httpx.Request) -> object:
    """A request's JSON body, parsed; None when it has none."""
    return json.loads(request.content) if request.content else None
