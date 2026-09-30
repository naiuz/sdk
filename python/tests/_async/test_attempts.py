import time

import httpx
import pytest

from naiuz import APITimeoutError, NotFoundError
from naiuz._async._http import AsyncHttpClient
from naiuz._async._io import TakeOver
from naiuz._models import WithRequestId
from naiuz._request import APIRequest
from naiuz._response import Attempt, read_envelope
from tests.helpers import KEY, MockAPI, api_error, silent_server

from ._io import Body, answer
from .clients import http_client


class Item(WithRequestId):
    """Anything an envelope holds."""


balance = APIRequest("GET", "/balance", "safe")


async def test_a_reader_that_takes_the_answer_over_reads_on_past_the_timeout() -> None:
    http, _ = http_client(MockAPI(answer(Body(b"a", b"b", gap=0.1))), timeout=0.15, max_retries=0)

    async def take(response: httpx.Response, attempt: Attempt) -> bytes:
        assert attempt.timeout == 0.15
        assert attempt.redact(f"Bearer {KEY}") == "Bearer [redacted]"
        return b"".join([chunk async for chunk in response.aiter_bytes()])

    assert await http.request(balance, TakeOver(take)) == b"ab"


async def test_the_answer_a_reader_takes_over_is_the_reader_s_to_close() -> None:
    body = Body(b"{}")
    http, _ = http_client(MockAPI(answer(body)))

    async def take(response: httpx.Response, attempt: Attempt) -> httpx.Response:
        return response

    response = await http.request(balance, TakeOver(take))
    assert not body.closed
    await response.aclose()
    assert body.closed


async def test_the_core_closes_the_answer_when_the_reader_taking_it_over_fails() -> None:
    body = Body(b"{}")
    http, _ = http_client(MockAPI(answer(body)))

    async def take(response: httpx.Response, attempt: Attempt) -> None:
        raise ValueError("The reader broke.")

    with pytest.raises(ValueError, match=r"^The reader broke\.$"):
        await http.request(balance, TakeOver(take))
    assert body.closed


async def test_an_error_answer_is_raised_as_usual_and_never_taken_over() -> None:
    taken: list[httpx.Response] = []

    async def take(response: httpx.Response, attempt: Attempt) -> None:
        taken.append(response)

    http, _ = http_client(MockAPI(api_error(404, "not_found")))
    with pytest.raises(NotFoundError):
        await http.request(balance, TakeOver(take))
    assert taken == []


@pytest.mark.parametrize(
    "first",
    [b"", b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"],
    ids=["never answers", "goes silent mid-answer"],
)
async def test_a_server_that_goes_silent_is_dropped_after_the_timeout(first: bytes) -> None:
    with silent_server(first) as base_url:
        async with httpx.AsyncClient(trust_env=False) as client:
            http = AsyncHttpClient(
                api_key=KEY,
                base_url=base_url,
                timeout=0.3,
                max_retries=0,
                default_headers={},
                user_agent="naiuz-python/test",
                client=client,
            )
            started = time.monotonic()
            with pytest.raises(APITimeoutError):
                await http.request(balance, read_envelope(Item))
            assert time.monotonic() - started < 2
