from typing import get_args

import pytest

from naiuz import RawResponse
from naiuz.types import Balance, Usage, UsageTotal
from tests.helpers import BALANCE, MockAPI, envelope

from .clients import client_for, retry_classes

USAGE = {
    "period": {"days": 7, "start": "2026-09-23", "end": "2026-09-29"},
    "total": {"requests": 2, "cost": 25, "formatted_cost": "25 credits", "currency": "credits"},
    "by_service": [{"service": "tts", "label": "Text to speech", "requests": 2, "cost": 25}],
    "by_key": [{"id": None, "name": "Dashboard", "requests": 2, "cost": 25}],
}


async def test_balance_reads_get_balance() -> None:
    api = MockAPI(envelope(BALANCE, "req-balance"))
    balance = await client_for(api).account.balance()
    assert isinstance(balance, Balance)
    assert balance.model_dump() == BALANCE
    assert (balance.balance, balance.request_id) == (10000, "req-balance")
    assert (api.requests[0].method, api.requests[0].url.raw_path) == ("GET", b"/api/v1/balance")


async def test_usage_sends_days_as_the_query_and_no_query_when_it_is_left_out() -> None:
    api = MockAPI(envelope(USAGE), envelope(USAGE))
    client = client_for(api)
    usage = await client.account.usage(days=7)
    await client.account.usage()
    assert isinstance(usage, Usage)
    assert usage.by_key[0].id is None
    assert [request.url.raw_path for request in api.requests] == [b"/api/v1/usage?days=7", b"/api/v1/usage"]


async def test_both_are_retried_as_safe_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(MockAPI(envelope(BALANCE), envelope(USAGE)))
    await client.account.balance()
    await client.account.usage()
    assert seen == ["safe", "safe"]


async def test_with_raw_response_gives_the_result_with_its_status_and_headers() -> None:
    raw = await client_for(MockAPI(envelope(BALANCE, "req-raw"))).account.with_raw_response.balance()
    assert isinstance(raw, RawResponse)
    assert raw.data.balance == 10000
    assert (raw.status, raw.headers["x-request-id"]) == (200, "req-raw")


def test_a_usage_total_names_credits_and_takes_a_unit_the_sdk_doesn_t_know_as_a_string() -> None:
    literal, other = get_args(UsageTotal.model_fields["currency"].annotation)
    assert (get_args(literal), other) == (("credits",), str)
    total = UsageTotal.model_validate({"requests": 1, "cost": 1, "formatted_cost": "1 credit", "currency": "tokens"})
    assert total.currency == "tokens"
