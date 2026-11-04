import json
from typing import Any

import pytest

from naiuz import AsyncNeuronAI, NeuronAI, WebhookVerificationError
from tests.helpers import KEY
from tests.spec import read_spec

VECTORS: dict[str, Any] = read_spec("webhooks/signature-vectors.json")
GOOD = [case for case in VECTORS["cases"] if case["valid"]]
BAD = [case for case in VECTORS["cases"] if not case["valid"]]


def verify(body: str | bytes, header: str | None) -> Any:
    return NeuronAI(api_key=KEY).webhooks.verify(
        body, header, VECTORS["secret"], now=VECTORS["now"], tolerance_seconds=VECTORS["tolerance_seconds"]
    )


@pytest.mark.parametrize("case", GOOD, ids=lambda case: case["name"])
def test_it_takes_a_good_signature(case: dict[str, str]) -> None:
    event = verify(case["body"], case["header"])

    assert event.id == json.loads(case["body"])["id"]
    assert event.data == json.loads(case["body"])["data"]


@pytest.mark.parametrize("case", GOOD, ids=lambda case: case["name"])
def test_it_takes_the_body_as_bytes(case: dict[str, str]) -> None:
    assert verify(case["body"].encode(), case["header"]).id == json.loads(case["body"])["id"]


@pytest.mark.parametrize("case", BAD, ids=lambda case: case["name"])
def test_it_refuses_a_bad_one(case: dict[str, str]) -> None:
    with pytest.raises(WebhookVerificationError):
        verify(case["body"], case["header"])


def test_it_refuses_a_request_with_no_header() -> None:
    with pytest.raises(WebhookVerificationError):
        verify("{}", None)


def test_it_goes_by_the_clock_when_it_isnt_told_the_time() -> None:
    with pytest.raises(WebhookVerificationError, match="too old"):
        NeuronAI(api_key=KEY).webhooks.verify(GOOD[0]["body"], GOOD[0]["header"], VECTORS["secret"])


def test_the_async_client_checks_it_the_same() -> None:
    event = AsyncNeuronAI(api_key=KEY).webhooks.verify(
        GOOD[0]["body"], GOOD[0]["header"], VECTORS["secret"], now=VECTORS["now"]
    )

    assert event.type == "conversation.ended"
