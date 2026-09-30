import json
from typing import Any

import httpx
import pytest

from naiuz import NeuronAI, NeuronAIError
from naiuz._errors import make_api_error
from naiuz._models import WithRequestId

from .harness import (
    DEFERRED_FIXTURES,
    DEFERRED_METHODS,
    FIXTURE_KEY,
    KINDS,
    OPERATIONS,
    Kind,
    client_of,
    comparable,
    expect_request,
    list_fixtures,
    load_fixture,
    project_error,
    project_result,
    replay,
    resolve_method,
    without_unknown_fields,
)

FIXTURES = list_fixtures()
REPLAYABLE = [file for file in FIXTURES if file not in DEFERRED_FIXTURES]
ERRORS = [file for file in FIXTURES if load_fixture(file)["response"]["status"] >= 400]
PYTHON_PATHS = [entry["python"] for entry in [*OPERATIONS["operations"].values(), *OPERATIONS["helpers"].values()]]


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("file", REPLAYABLE)
async def test_a_fixture_sends_its_request_and_returns_its_result(file: str, kind: Kind) -> None:
    fixture = load_fixture(file)
    replayed = await replay(fixture, kind)
    expect_request(replayed.requests, fixture["request"])
    assert comparable(without_unknown_fields(replayed.result, fixture)) == comparable(fixture["result"])


@pytest.mark.parametrize("file", ERRORS)
def test_an_error_fixture_s_answer_maps_to_its_error_deferred_or_not(file: str) -> None:
    response = load_fixture(file)["response"]
    body = json.dumps(response["body"]["json"]) if response["body"] is not None else ""
    error = make_api_error(response["status"], "", httpx.Headers(response["headers"]), body)
    assert comparable(project_error(error)) == comparable(load_fixture(file)["result"])


def test_the_deferred_lists_name_only_real_fixtures_and_methods() -> None:
    assert set(DEFERRED_FIXTURES) <= set(FIXTURES)
    assert set(DEFERRED_METHODS) <= set(PYTHON_PATHS)


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("file", DEFERRED_FIXTURES)
async def test_a_deferred_fixture_can_t_replay_yet(file: str, kind: Kind) -> None:
    with pytest.raises((LookupError, NeuronAIError), match=r"is not on the client|later version"):
        await replay(load_fixture(file), kind)


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("path", PYTHON_PATHS)
def test_every_method_exists_unless_it_is_deferred(path: str, kind: Kind) -> None:
    method = resolve_method(client_of(kind, httpx.MockTransport(lambda request: httpx.Response(500))), path)
    if path in DEFERRED_METHODS:
        assert method is None, f"client.{path} exists now: take it off DEFERRED_METHODS"
    else:
        assert method is not None, f"client.{path} is missing"


def test_a_fixture_replays_for_every_operation_whose_method_exists() -> None:
    replayed = {file.split("/")[0] for file in REPLAYABLE}
    for operation_id, entry in OPERATIONS["operations"].items():
        if entry["python"] not in DEFERRED_METHODS:
            assert operation_id in replayed, operation_id


def sent(target: str) -> httpx.Request:
    return httpx.Request("GET", f"https://my.neuronai.uz{target}", headers={"authorization": f"Bearer {FIXTURE_KEY}"})


EXPECTED: dict[str, Any] = {
    "method": "GET",
    "path": "/tts/voices/O%27zbek",
    "query": {"limit": "3"},
    "headers": {"authorization": f"Bearer {FIXTURE_KEY}"},
    "body": None,
}


def test_expect_request_passes_the_request_the_fixture_describes() -> None:
    expect_request([sent("/api/v1/tts/voices/O%27zbek?limit=3")], EXPECTED)


def test_expect_request_fails_when_a_query_key_is_sent_twice() -> None:
    with pytest.raises(AssertionError):
        expect_request([sent("/api/v1/tts/voices/O%27zbek?limit=2&limit=3")], EXPECTED)


def test_expect_request_fails_when_the_call_sends_more_than_one_request() -> None:
    request = sent("/api/v1/tts/voices/O%27zbek?limit=3")
    with pytest.raises(AssertionError, match="exactly one request"):
        expect_request([request, request], EXPECTED)


def test_expect_request_compares_the_raw_target_so_a_path_encoded_otherwise_fails() -> None:
    with pytest.raises(AssertionError):
        expect_request([sent("/api/v1/tts/voices/O'zbek?limit=3")], EXPECTED)


def test_unknown_fields_on_a_compatible_result_leave_the_body_and_never_the_cost() -> None:
    fixture: dict[str, Any] = {"operationId": "createChatCompletion", "unknown_fields": ["/cost", "/beta"]}
    result = {"body": {"id": "chatcmpl-x", "cost": 111, "beta": True}, "cost": 999}
    assert without_unknown_fields(result, fixture) == {"body": {"id": "chatcmpl-x"}, "cost": 999}


def test_project_result_decides_the_shape_from_the_operation_not_from_the_value() -> None:
    empty = httpx.Response(200, json={"data": [], "next_cursor": None, "request_id": "r"})
    client = NeuronAI(api_key=FIXTURE_KEY, http_client=httpx.Client(transport=httpx.MockTransport(lambda _: empty)))
    with pytest.raises(AssertionError, match="retrieveApiKey"):
        project_result("retrieveApiKey", client.api_keys.list())
    with pytest.raises(AssertionError, match="listApiKeys"):
        project_result("listApiKeys", WithRequestId())


def test_comparable_drops_nulls_and_tells_a_boolean_from_a_number() -> None:
    with_nulls: dict[str, object] = {"a": None, "b": [1, {"c": None}]}
    without: dict[str, object] = {"b": [1.0, {}]}
    assert comparable(with_nulls) == comparable(without)
    assert comparable({"enabled": True}) != comparable({"enabled": 1})


BODY_EXPECTED: dict[str, Any] = {
    "method": "PATCH",
    "path": "/api-keys/key_1",
    "headers": {"authorization": f"Bearer {FIXTURE_KEY}"},
    "body": {"json": {"name": "Ops", "limit": 1, "enabled": True}},
}


def patched(body: dict[str, object]) -> httpx.Request:
    return httpx.Request(
        "PATCH",
        "https://my.neuronai.uz/api/v1/api-keys/key_1",
        headers={"authorization": f"Bearer {FIXTURE_KEY}"},
        json=body,
    )


def test_expect_request_passes_a_body_that_differs_only_in_key_order_or_how_a_number_is_written() -> None:
    expect_request([patched({"enabled": True, "limit": 1.0, "name": "Ops"})], BODY_EXPECTED)


@pytest.mark.parametrize(
    ("body", "expected_body"),
    [
        ({"name": "Ops", "expires_at": None}, {"name": "Ops"}),
        ({"name": "Ops"}, {"name": "Ops", "expires_at": None}),
        ({"name": "Ops", "enabled": 1}, {"name": "Ops", "enabled": True}),
    ],
    ids=["a null the fixture doesn't hold", "a null the fixture holds, left out", "a number for a boolean"],
)
def test_expect_request_compares_the_body_exactly_null_for_null(
    body: dict[str, object], expected_body: dict[str, object]
) -> None:
    """A null in a request body is an instruction, such as clearing a key's expiry, so it never matches absence."""
    with pytest.raises(AssertionError):
        expect_request([patched(body)], {**BODY_EXPECTED, "body": {"json": expected_body}})
