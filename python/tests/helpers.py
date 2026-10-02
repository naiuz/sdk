"""What the unit tests build their answers from."""

from __future__ import annotations

import base64
import contextlib
import email.parser
import email.policy
import json
import re
import socket
import threading
import time
import traceback
from collections.abc import Callable, Generator
from datetime import datetime, timezone
from pathlib import Path
from types import FrameType
from typing import cast

import httpx

import naiuz

KEY = "nai_unit_test_key"
"""The key every unit test's client sends."""

BALANCE = {
    "balance": 10000,
    "formatted": "10 000 UZS",
    "currency": "UZS",
    "stt_price_per_minute": 500,
    "tts_price_per_char": 2.5,
    "min_topup": 5000,
}
"""A balance as the API sends it."""

BASE_URL = "https://my.neuronai.uz/api/v1"

NOW = datetime(2026, 9, 29, 10, 0, 0, tzinfo=timezone.utc).timestamp()
"""The clock unit tests run at: Tue, 29 Sep 2026 10:00:00 GMT."""

UUID_V4 = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")

Reply = httpx.Response | BaseException | Callable[[httpx.Request], httpx.Response]
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
        if isinstance(reply, BaseException):
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


def form_of(request: httpx.Request) -> dict[str, dict[str, object]]:
    """A multipart request's form, parsed as a mail reader parses one, in the fixtures' `{fields, files}` shape.

    Each `name[]` part's text goes into a list under `name`, and each file is its filename, content type and bytes in
    base64. A body that isn't a well-formed multipart form, or a part sent twice under one name, fails the test.
    """
    head = f"Content-Type: {request.headers['content-type']}\r\n\r\n".encode()
    message = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(head + request.content)
    assert message.is_multipart(), "the body is a multipart form"
    assert not message.defects, message.defects
    fields: dict[str, object] = {}
    files: dict[str, object] = {}
    for part in message.iter_parts():
        name = str(part.get_param("name", header="content-disposition"))
        content = cast("bytes", part.get_payload(decode=True))
        filename = part.get_filename()
        if filename is not None:
            assert name not in files, f"the file {name} is sent once"
            encoded = base64.b64encode(content).decode()
            files[name] = {"filename": filename, "content_type": str(part.get("content-type")), "base64": encoded}
        elif name.endswith("[]"):
            cast("list[str]", fields.setdefault(name[:-2], [])).append(content.decode())
        else:
            assert name not in fields, f"the field {name} is sent once"
            fields[name] = content.decode()
    return {"fields": fields, "files": files}


def sdk_frames(error: BaseException) -> list[FrameType]:
    """The frames of the SDK's own code that an error, and each error it was raised from, passed through."""
    package = Path(naiuz.__file__).parent
    frames: list[FrameType] = []
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        walked = traceback.walk_tb(current.__traceback__)
        frames += [frame for frame, _ in walked if Path(frame.f_code.co_filename).is_relative_to(package)]
        current = current.__cause__ or current.__context__
    return frames


@contextlib.contextmanager
def silent_server(first: bytes, *then: bytes, gap: float = 0.0) -> Generator[str, None, None]:
    """A local HTTP server that sends `first` on each connection, then each of `then` `gap` seconds apart, then goes
    silent. Yields its base URL.

    It hangs up after 5 seconds, so a client that never times out fails its test instead of hanging it.
    """
    server = socket.create_server(("127.0.0.1", 0))
    server.settimeout(0.05)
    done = threading.Event()

    def serve() -> None:
        connections: list[socket.socket] = []
        give_up = time.monotonic() + 5
        while not done.is_set() and time.monotonic() < give_up:
            try:
                connection, _ = server.accept()
            except TimeoutError:
                continue
            connections.append(connection)
            connection.recv(65536)
            connection.sendall(first)
            for piece in then:
                time.sleep(gap)
                connection.sendall(piece)
        for connection in connections:
            connection.close()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.getsockname()[1]}/api/v1"
    finally:
        done.set()
        thread.join()
        server.close()
