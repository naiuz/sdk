"""HTTP cores and clients for the tests, on a mocked HTTP layer."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

import httpx
import pytest

from naiuz import AsyncNeuronAI
from naiuz._async._http import AsyncHttpClient
from naiuz._async.resources.tts import AsyncTtsJobs
from naiuz._request import APIRequest
from tests.helpers import BASE_URL, KEY, NOW, MockAPI


def http_client(
    api: MockAPI,
    *,
    timeout: float = 1.0,
    max_retries: int = 2,
    default_headers: Mapping[str, str] | None = None,
    random: Callable[[], float] = lambda: 0.0,
) -> tuple[AsyncHttpClient, list[float]]:
    """An HTTP core on `api` that records its waits instead of waiting, with no jitter and a fixed clock."""
    waits: list[float] = []

    async def wait(seconds: float) -> None:
        waits.append(seconds)

    http = AsyncHttpClient(
        api_key=KEY,
        base_url=BASE_URL,
        timeout=timeout,
        max_retries=max_retries,
        default_headers=default_headers or {},
        user_agent="naiuz-python/test (Python 3.12; Linux)",
        client=httpx.AsyncClient(transport=api.transport()),
        sleep=wait,
        random=random,
        clock=lambda: NOW,
    )
    return http, waits


class Clock:
    """A clock that moves only when the code under test sleeps, and records each sleep."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds

    def monotonic(self) -> float:
        return self.now


def jobs_on(api: MockAPI, clock: Clock) -> AsyncTtsJobs:
    """Synthesis jobs on `api`, whose waits run on `clock`: a client's, with its 300-second timeout and no retries."""
    http = AsyncHttpClient(
        api_key=KEY,
        base_url=BASE_URL,
        timeout=300.0,
        max_retries=0,
        default_headers={},
        user_agent="naiuz-python/test (Python 3.12; Linux)",
        client=httpx.AsyncClient(transport=api.transport()),
        sleep=clock.sleep,
        random=lambda: 0.0,
        clock=lambda: NOW,
        monotonic=clock.monotonic,
    )
    return AsyncTtsJobs(http)


def options_of(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, float | None, int | None]]:
    """Records the method, timeout and max_retries of every call the HTTP core sends."""
    seen: list[tuple[str, float | None, int | None]] = []
    request = AsyncHttpClient.request

    async def spy(self: AsyncHttpClient, api_request: APIRequest, reader: Any) -> Any:
        seen.append((api_request.method, api_request.options.timeout, api_request.options.max_retries))
        return await request(self, api_request, reader)

    monkeypatch.setattr(AsyncHttpClient, "request", spy)
    return seen


def client_for(
    api: MockAPI,
    *,
    max_retries: int = 0,
    timeout: float | None = None,
    default_headers: Mapping[str, str] | None = None,
) -> AsyncNeuronAI:
    """A client on `api` that doesn't retry, unless the test says so."""
    return AsyncNeuronAI(
        api_key=KEY,
        http_client=httpx.AsyncClient(transport=api.transport()),
        max_retries=max_retries,
        timeout=timeout,
        default_headers=default_headers,
    )


def retry_classes(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Records the retry class of every call the HTTP core sends."""
    seen: list[str] = []
    request = AsyncHttpClient.request

    async def spy(self: AsyncHttpClient, api_request: APIRequest, reader: Any) -> Any:
        seen.append(api_request.retry)
        return await request(self, api_request, reader)

    monkeypatch.setattr(AsyncHttpClient, "request", spy)
    return seen
