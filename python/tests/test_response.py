import json

import httpx
import pytest

from naiuz import APIError, RawResponse
from naiuz._models import WithCost, WithRequestId
from naiuz._response import (
    Answer,
    capture,
    number_header,
    read_body,
    read_envelope,
    read_nothing,
    read_page,
    record,
)

KEY = "nai_unit_test_key"


class Voice(WithRequestId):
    id: str
    name: str


class Completion(WithCost):
    id: str


def answer(body: object, headers: dict[str, str] | None = None, status: int = 200, reason: str = "OK") -> Answer:
    content = body if isinstance(body, bytes) else json.dumps(body).encode()
    return Answer(status, reason, httpx.Headers(headers), content, lambda text: text.replace(KEY, "[redacted]"))


def test_read_envelope_gives_data_as_the_model_with_the_request_id() -> None:
    voice = read_envelope(Voice)(answer({"data": {"id": "uz-sardor", "name": "Sardor"}, "request_id": "req-1"}))
    assert voice == Voice(id="uz-sardor", name="Sardor")
    assert voice.request_id == "req-1"


def test_read_envelope_keeps_fields_the_sdk_doesn_t_know_yet() -> None:
    voice = read_envelope(Voice)(answer({"data": {"id": "v1", "name": "V", "brand_new": [1, 2]}, "request_id": "r"}))
    assert voice.model_dump() == {"id": "v1", "name": "V", "brand_new": [1, 2]}


def test_read_envelope_takes_the_request_id_from_x_request_id_then_none() -> None:
    data = {"data": {"id": "v1", "name": "V"}}
    assert read_envelope(Voice)(answer(data, {"x-request-id": "req-header"})).request_id == "req-header"
    assert read_envelope(Voice)(answer(data)).request_id is None


def test_read_envelope_raises_api_error_with_the_status_for_a_success_that_isn_t_json() -> None:
    page = answer(b"<html>Sign in to the Wi-Fi</html>", {"content-type": "text/html"})
    with pytest.raises(APIError) as caught:
        read_envelope(Voice)(page)
    assert (caught.value.status, caught.value.code) == (200, None)
    assert caught.value.message == "OK: <html>Sign in to the Wi-Fi</html>"


def test_read_envelope_redacts_the_api_key_from_an_answer_it_can_t_use() -> None:
    with pytest.raises(APIError) as caught:
        read_envelope(Voice)(answer(f"<pre>Authorization: Bearer {KEY}</pre>".encode()))
    assert caught.value.message == "OK: <pre>Authorization: Bearer [redacted]</pre>"


@pytest.mark.parametrize("body", [{"request_id": "r"}, {"data": [1], "request_id": "r"}, [1, 2]])
def test_read_envelope_raises_api_error_without_a_data_object(body: object) -> None:
    with pytest.raises(APIError):
        read_envelope(Voice)(answer(body))


def test_read_envelope_raises_api_error_for_data_that_isn_t_the_object_the_call_returns() -> None:
    with pytest.raises(APIError) as caught:
        read_envelope(Voice)(answer({"data": {"id": "v1", "token": KEY}, "request_id": "r"}))
    assert caught.value.status == 200
    assert KEY not in caught.value.message
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


def test_read_body_gives_the_body_with_the_cost_from_x_cost() -> None:
    completion = read_body(Completion)(answer({"id": "chatcmpl-1"}, {"x-cost": "0.34"}))
    assert completion.cost == 0.34
    assert completion.model_dump() == {"id": "chatcmpl-1"}


def test_read_body_leaves_the_cost_none_when_x_cost_is_absent_or_not_a_number() -> None:
    assert read_body(Completion)(answer({"id": "c"})).cost is None
    assert read_body(Completion)(answer({"id": "c"}, {"x-cost": "free"})).cost is None


def test_read_page_gives_the_items_the_cursor_and_the_request_id() -> None:
    body = {"data": [{"id": "a", "name": "A"}], "next_cursor": "c2", "request_id": "req-page"}
    page = read_page(Voice)(answer(body))
    assert page.items == [Voice(id="a", name="A")]
    assert (page.next_cursor, page.request_id) == ("c2", "req-page")
    assert page.items[0].request_id is None


def test_read_page_treats_a_cursor_that_isn_t_a_string_as_the_last_page() -> None:
    assert read_page(Voice)(answer({"data": [], "next_cursor": 42, "request_id": "r"})).next_cursor is None


@pytest.mark.parametrize("body", [{"data": {"id": "a"}, "request_id": "r"}, {"data": ["a"], "request_id": "r"}])
def test_read_page_raises_api_error_without_a_list_of_objects(body: object) -> None:
    with pytest.raises(APIError):
        read_page(Voice)(answer(body))


def test_read_nothing_reads_nothing_whatever_the_body() -> None:
    read_nothing(answer(b"", status=204))
    read_nothing(answer(b"<html>", status=204))


def test_number_header_reads_a_number_and_gives_none_otherwise() -> None:
    headers = httpx.Headers({"x-cost": " 12.5 ", "x-blank": " ", "x-word": "abc", "x-huge": "1e999"})
    assert number_header(headers, "x-cost") == 12.5
    for name in ("x-missing", "x-blank", "x-word", "x-huge"):
        assert number_header(headers, name) is None


def test_capture_records_the_answer_a_call_took_its_result_from_only_inside_its_block() -> None:
    record(500, httpx.Headers({"x-request-id": "outside"}))
    with capture() as captured:
        record(201, httpx.Headers({"x-request-id": "req-1"}))
    record(503, httpx.Headers())
    assert captured.status == 201
    assert captured.headers["x-request-id"] == "req-1"


def test_a_raw_response_holds_the_result_the_status_and_the_headers() -> None:
    raw = RawResponse(data=[1], status=200, headers=httpx.Headers({"x-request-id": "r"}))
    assert (raw.data, raw.status, raw.headers["x-request-id"]) == ([1], 200, "r")
