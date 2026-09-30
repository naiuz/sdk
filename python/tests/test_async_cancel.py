"""How the async client is cancelled: the asyncio way, by cancelling the task that awaits the call."""

import asyncio
import sys
import time

import httpx
import pytest

from naiuz import APITimeoutError
from naiuz._async._http import AsyncHttpClient
from naiuz._models import WithRequestId
from naiuz._request import APIRequest
from naiuz._response import read_envelope
from tests._async._io import Body, answer
from tests.helpers import BASE_URL, KEY, MockAPI, api_error, envelope


class Item(WithRequestId):
    """Anything an envelope holds."""


balance = APIRequest("GET", "/balance", "safe")
read_item = read_envelope(Item)


def http_client(transport: httpx.AsyncBaseTransport, *, timeout: float = 5.0, max_retries: int = 2) -> AsyncHttpClient:
    """An HTTP core that really waits between attempts."""
    return AsyncHttpClient(
        api_key=KEY,
        base_url=BASE_URL,
        timeout=timeout,
        max_retries=max_retries,
        default_headers={},
        user_agent="naiuz-python/test",
        client=httpx.AsyncClient(transport=transport),
    )


async def test_cancelling_the_task_stops_the_request_in_flight_and_it_is_never_retried() -> None:
    sent: list[httpx.Request] = []

    async def never_answers(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    task = asyncio.create_task(http_client(httpx.MockTransport(never_answers)).request(balance, read_item))
    await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert len(sent) == 1


async def test_cancelling_the_task_while_the_answer_arrives_closes_the_answer() -> None:
    body = Body(b"{", gap=0.02, forever=True)
    task = asyncio.create_task(http_client(MockAPI(answer(body)).transport()).request(balance, read_item))
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert body.closed


async def test_cancelling_the_task_cuts_the_wait_between_attempts_short() -> None:
    api = MockAPI(api_error(503, "service_unavailable", {"retry-after": "30"}), envelope({}))
    task = asyncio.create_task(http_client(api.transport()).request(balance, read_item))
    started = time.monotonic()
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert time.monotonic() - started < 5
    assert len(api.requests) == 1


async def test_a_caller_s_own_timeout_still_ends_the_call() -> None:
    body = Body(b"{", gap=0.02, forever=True)
    # asyncio's TimeoutError is the builtin one from Python 3.11, and its own class before.
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(http_client(MockAPI(answer(body)).transport()).request(balance, read_item), 0.1)
    assert body.closed


@pytest.mark.skipif(sys.version_info < (3, 11), reason="Python 3.10 can't end an attempt exactly at its deadline")
async def test_an_answer_that_stops_arriving_is_cut_off_exactly_at_the_deadline() -> None:
    body = Body(b"{", stall=True)
    started = time.monotonic()
    with pytest.raises(APITimeoutError):
        await http_client(MockAPI(answer(body)).transport(), timeout=0.2, max_retries=0).request(balance, read_item)
    assert time.monotonic() - started < 1
    assert body.closed
