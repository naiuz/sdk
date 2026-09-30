# Written by scripts/unasync.py from tests/_async/clients.py. Edit that file, then run the script.
"""HTTP cores and clients for the tests, on a mocked HTTP layer."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

import httpx
import pytest

from naiuz import NeuronAI
from naiuz._sync._http import HttpClient
from naiuz._request import APIRequest
from tests.helpers import BASE_URL, KEY, NOW, MockAPI


def http_client(
    api: MockAPI,
    *,
    timeout: float = 1.0,
    max_retries: int = 2,
    default_headers: Mapping[str, str] | None = None,
    random: Callable[[], float] = lambda: 0.0,
) -> tuple[HttpClient, list[float]]:
    """An HTTP core on `api` that records its waits instead of waiting, with no jitter and a fixed clock."""
    waits: list[float] = []

    def wait(seconds: float) -> None:
        waits.append(seconds)

    http = HttpClient(
        api_key=KEY,
        base_url=BASE_URL,
        timeout=timeout,
        max_retries=max_retries,
        default_headers=default_headers or {},
        user_agent="naiuz-python/test (Python 3.12; Linux)",
        client=httpx.Client(transport=api.transport()),
        sleep=wait,
        random=random,
        clock=lambda: NOW,
    )
    return http, waits


def client_for(
    api: MockAPI,
    *,
    max_retries: int = 0,
    timeout: float | None = None,
    default_headers: Mapping[str, str] | None = None,
) -> NeuronAI:
    """A client on `api` that doesn't retry, unless the test says so."""
    return NeuronAI(
        api_key=KEY,
        http_client=httpx.Client(transport=api.transport()),
        max_retries=max_retries,
        timeout=timeout,
        default_headers=default_headers,
    )


def retry_classes(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Records the retry class of every call the HTTP core sends."""
    seen: list[str] = []
    request = HttpClient.request

    def spy(self: HttpClient, api_request: APIRequest, reader: Any) -> Any:
        seen.append(api_request.retry)
        return request(self, api_request, reader)

    monkeypatch.setattr(HttpClient, "request", spy)
    return seen
