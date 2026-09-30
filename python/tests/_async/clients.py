"""HTTP cores and clients for the tests, on a mocked HTTP layer."""

from __future__ import annotations

from collections.abc import Callable, Mapping

import httpx

from naiuz._async._http import AsyncHttpClient
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
