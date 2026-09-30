"""How the sync client is interrupted: Ctrl+C raises KeyboardInterrupt wherever the call is."""

import httpx
import pytest

from naiuz._models import WithRequestId
from naiuz._request import APIRequest
from naiuz._response import read_envelope
from naiuz._sync._http import HttpClient
from tests._sync._io import Body, answer
from tests.helpers import BASE_URL, KEY, MockAPI


class Item(WithRequestId):
    """Anything an envelope holds."""


balance = APIRequest("GET", "/balance", "safe")


def http_client(api: MockAPI) -> HttpClient:
    return HttpClient(
        api_key=KEY,
        base_url=BASE_URL,
        timeout=5.0,
        max_retries=2,
        default_headers={},
        user_agent="naiuz-python/test",
        client=httpx.Client(transport=api.transport()),
    )


def test_ctrl_c_during_the_request_propagates_as_it_is_and_is_never_retried() -> None:
    api = MockAPI(KeyboardInterrupt())
    with pytest.raises(KeyboardInterrupt):
        http_client(api).request(balance, read_envelope(Item))
    assert len(api.requests) == 1


def test_ctrl_c_while_the_answer_arrives_closes_the_answer() -> None:
    body = Body(b"{", error=KeyboardInterrupt())
    api = MockAPI(answer(body))
    with pytest.raises(KeyboardInterrupt):
        http_client(api).request(balance, read_envelope(Item))
    assert body.closed
    assert len(api.requests) == 1
