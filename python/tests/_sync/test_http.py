# Written by scripts/unasync.py from tests/_async/test_http.py. Edit that file, then run the script.
import base64
import contextlib
import math
import traceback
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from naiuz import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    ConflictError,
    InternalServerError,
    NeuronAIError,
    NotFoundError,
    RateLimitError,
)
from naiuz._models import WithRequestId
from naiuz._request import APIRequest, RequestOptions
from naiuz._response import capture, read_envelope, read_nothing
from naiuz._retry import RetryClass
from naiuz._uploads import Form
from tests.helpers import (
    KEY,
    UUID_V4,
    MockAPI,
    Reply,
    api_error,
    body_of,
    envelope,
    form_of,
    json_response,
    no_content,
    refused,
    reset,
    sdk_frames,
)

from ._io import Body, answer
from .clients import http_client


class Item(WithRequestId):
    """Anything an envelope holds."""


read_item = read_envelope(Item)
balance = APIRequest("GET", "/balance", "safe")
create_job = APIRequest("POST", "/tts/jobs", "idempotent", body={"text": "Salom"})
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt "
clip = {"filename": "sample.wav", "content_type": "audio/wav", "base64": base64.b64encode(WAV).decode()}
voice_form = Form({"name": "Office voice", "tags": ["support"], "ref_audio": ("sample.wav", WAV)}, ("ref_audio",))
create_voice = APIRequest("POST", "/tts/voices", "idempotent", form=voice_form)


def printed(error: BaseException) -> str:
    """Every way an error is printed: its text, its repr and its traceback, causes included."""
    return "\n".join([str(error), repr(error), repr(error.args), *traceback.format_exception(error)])


def test_it_sends_the_bearer_key_a_json_accept_and_the_user_agent() -> None:
    api = MockAPI(envelope({"balance": 1}))
    http, _ = http_client(api)
    http.request(balance, read_item)
    [sent] = api.requests
    assert (sent.method, str(sent.url)) == ("GET", "https://my.neuronai.uz/api/v1/balance")
    assert sent.headers["authorization"] == f"Bearer {KEY}"
    assert sent.headers["accept"] == "application/json"
    assert sent.headers["user-agent"] == "naiuz-python/test (Python 3.12; Linux)"


def test_it_sends_a_call_s_own_accept_in_place_of_json_s() -> None:
    api = MockAPI(envelope({}))
    http, _ = http_client(api)
    http.request(replace(balance, accept="audio/wav, application/json"), read_item)
    assert api.requests[0].headers["accept"] == "audio/wav, application/json"


def test_it_sends_a_body_as_json_with_its_content_type_and_no_content_type_without_one() -> None:
    api = MockAPI(envelope({"id": "k1"}), no_content())
    http, _ = http_client(api)
    update = APIRequest("PATCH", "/api-keys/{id}", "safe", path_params={"id": "k1"}, body={"enabled": False, "x": None})
    http.request(update, read_item)
    http.request(APIRequest("POST", "/api-keys/{id}/revoke", "safe", path_params={"id": "k1"}), read_nothing)
    assert api.requests[0].content == b'{"enabled":false,"x":null}'
    assert api.requests[0].headers["content-type"] == "application/json"
    assert api.requests[1].content == b""
    assert "content-type" not in api.requests[1].headers


def test_it_adds_the_default_headers_then_the_call_s_extra_headers_over_them() -> None:
    api = MockAPI(envelope({}))
    http, _ = http_client(api, default_headers={"X-App": "shop", "x-trace": "default"})
    http.request(replace(balance, options=RequestOptions(extra_headers={"X-Trace": "call"})), read_item)
    assert api.requests[0].headers["x-app"] == "shop"
    assert api.requests[0].headers.get_list("x-trace") == ["call"]


@pytest.mark.parametrize(
    ("name", "value"), [("x-token", "secret\nvalue"), ("x-token", "secret ключ"), ("x token", "v")]
)
def test_it_refuses_a_header_http_can_t_carry_naming_it_but_never_its_value(name: str, value: str) -> None:
    api = MockAPI()
    http, _ = http_client(api)
    with pytest.raises(NeuronAIError) as caught:
        http.request(replace(balance, options=RequestOptions(extra_headers={name: value})), read_item)
    assert str(caught.value) == f'The header "{name}" has a name or value that HTTP can\'t carry.'
    assert (caught.value.__cause__, caught.value.__context__) == (None, None)
    assert "secret" not in printed(caught.value)
    assert api.requests == []


def test_it_refuses_a_body_json_can_t_carry_sending_nothing() -> None:
    api = MockAPI()
    http, _ = http_client(api)
    with pytest.raises(NeuronAIError, match=r"^The request can't be sent as JSON: "):
        http.request(replace(create_job, body={"speed": math.nan}), read_item)
    assert api.requests == []


def test_it_records_the_status_and_headers_of_the_answer_its_result_came_from() -> None:
    api = MockAPI(envelope({"id": "job-1"}, "req-7", 202))
    http, _ = http_client(api)
    with capture() as captured:
        job = http.request(create_job, read_item)
    assert job.request_id == "req-7"
    assert (captured.status, captured.headers["x-request-id"]) == (202, "req-7")


def test_it_raises_an_error_answer_as_its_class_with_the_envelope_s_details() -> None:
    http, _ = http_client(MockAPI(api_error(404, "not_found")))
    with pytest.raises(NotFoundError) as caught:
        http.request(balance, read_item)
    assert (caught.value.status, caught.value.code, caught.value.request_id) == (404, "not_found", "req-error")
    assert caught.value.message == "The not_found message."


def test_it_raises_api_error_for_a_success_that_isn_t_json_without_retrying_it() -> None:
    api = MockAPI(httpx.Response(200, content=b"<html>login</html>", headers={"content-type": "text/html"}))
    http, _ = http_client(api)
    with pytest.raises(APIError) as caught:
        http.request(balance, read_item)
    assert caught.value.status == 200
    assert len(api.requests) == 1


def test_it_retries_a_503_twice_waiting_half_a_second_then_a_second_then_raises() -> None:
    api = MockAPI(*(api_error(503, "service_unavailable") for _ in range(3)))
    http, waits = http_client(api)
    with pytest.raises(InternalServerError):
        http.request(balance, read_item)
    assert len(api.requests) == 3
    assert waits == [0.5, 1.0]


def test_it_raises_the_last_error_when_every_attempt_fails_each_differently() -> None:
    api = MockAPI(
        api_error(503, "service_unavailable"), api_error(502, "upstream_error"), api_error(500, "server_error")
    )
    http, _ = http_client(api)
    with pytest.raises(InternalServerError) as caught:
        http.request(balance, read_item)
    assert (caught.value.status, caught.value.code) == (500, "server_error")


def test_it_stops_as_soon_as_an_attempt_succeeds() -> None:
    api = MockAPI(api_error(502, "upstream_error"), envelope({"balance": 5}))
    http, waits = http_client(api)
    assert (http.request(balance, read_item)).model_dump() == {"balance": 5}
    assert len(api.requests) == 2
    assert waits == [0.5]


def test_it_adds_up_to_25_percent_jitter_to_the_wait() -> None:
    http, waits = http_client(MockAPI(api_error(503, "service_unavailable"), envelope({})), random=lambda: 0.5)
    http.request(balance, read_item)
    assert waits == [0.5625]


def test_it_never_retries_an_error_status_other_than_429_and_5xx() -> None:
    api = MockAPI(api_error(409, "conflict"))
    http, _ = http_client(api)
    with pytest.raises(ConflictError):
        http.request(balance, read_item)
    assert len(api.requests) == 1


def test_it_makes_one_attempt_with_max_retries_0_a_call_s_value_winning() -> None:
    api = MockAPI(api_error(503, "service_unavailable"))
    http, _ = http_client(api, max_retries=2)
    with pytest.raises(InternalServerError):
        http.request(replace(balance, options=RequestOptions(max_retries=0)), read_item)
    assert len(api.requests) == 1


def test_it_refuses_an_invalid_per_call_max_retries_or_timeout_without_sending() -> None:
    api = MockAPI()
    http, _ = http_client(api)
    with pytest.raises(NeuronAIError, match=r"^max_retries must be a whole number, 0 or more\.$"):
        http.request(replace(balance, options=RequestOptions(max_retries=-1)), read_item)
    with pytest.raises(NeuronAIError, match=r"^timeout must be a number of seconds, more than 0 and at most"):
        http.request(replace(balance, options=RequestOptions(timeout=0)), read_item)
    assert api.requests == []


def test_it_waits_what_retry_after_says_instead_of_the_backoff() -> None:
    http, waits = http_client(MockAPI(api_error(429, "rate_limit_exceeded", {"retry-after": "3"}), envelope({})))
    http.request(balance, read_item)
    assert waits == [3.0]


def test_it_reads_a_retry_after_date_as_the_seconds_from_now() -> None:
    date = {"retry-after": "Tue, 29 Sep 2026 10:00:05 GMT"}
    http, waits = http_client(MockAPI(api_error(503, "service_unavailable", date), envelope({})))
    http.request(balance, read_item)
    assert waits == [5.0]


def test_it_raises_at_once_rather_than_wait_a_retry_after_of_more_than_a_minute() -> None:
    api = MockAPI(api_error(503, "service_unavailable", {"retry-after": "1800"}))
    http, waits = http_client(api)
    with pytest.raises(InternalServerError):
        http.request(balance, read_item)
    assert len(api.requests) == 1
    assert waits == []


def test_a_429_asking_for_more_than_a_minute_raises_at_once_and_reports_the_whole_wait() -> None:
    api = MockAPI(api_error(429, "rate_limit_exceeded", {"retry-after": "1800"}))
    http, waits = http_client(api)
    with pytest.raises(RateLimitError) as caught:
        http.request(balance, read_item)
    assert len(api.requests) == 1
    assert waits == []
    assert caught.value.retry_after == 1800


def test_a_429_without_retry_after_waits_the_backoff_and_reports_retry_after_as_none() -> None:
    api = MockAPI(api_error(429, "concurrency_limit_exceeded"), api_error(429, "concurrency_limit_exceeded"))
    http, waits = http_client(api, max_retries=1)
    with pytest.raises(RateLimitError) as caught:
        http.request(balance, read_item)
    assert waits == [0.5]
    assert caught.value.retry_after is None


@pytest.mark.parametrize(
    ("retry", "failure", "requests"),
    [
        ("safe", reset(), 2),
        ("idempotent", reset(), 2),
        ("paid", reset(), 1),
        ("recreate", reset(), 1),
        ("once", reset(), 1),
        ("once", refused(), 2),
        ("paid", refused(), 2),
        ("once", api_error(503, "service_unavailable"), 1),
        ("paid", api_error(503, "service_unavailable"), 2),
        ("recreate", api_error(503, "service_unavailable"), 2),
        ("safe", api_error(501, "server_error"), 1),
        ("idempotent", api_error(501, "server_error"), 2),
        ("once", api_error(429, "rate_limit_exceeded"), 2),
    ],
)
def test_a_call_retries_only_what_its_class_allows(retry: RetryClass, failure: Reply, requests: int) -> None:
    api = MockAPI(failure, envelope({}))
    http, _ = http_client(api, max_retries=1)
    with contextlib.suppress(NeuronAIError):
        http.request(replace(balance, retry=retry), read_item)
    assert len(api.requests) == requests


def test_it_doesn_t_retry_a_paid_call_s_bare_5xx_without_the_error_envelope() -> None:
    api = MockAPI(httpx.Response(502, content=b"<html>502 Bad Gateway</html>", headers={"content-type": "text/html"}))
    http, _ = http_client(api)
    with pytest.raises(InternalServerError) as caught:
        http.request(replace(balance, retry="paid"), read_item)
    assert caught.value.status == 502
    assert len(api.requests) == 1


def test_it_retries_a_paid_call_s_5xx_that_carries_the_error_envelope() -> None:
    api = MockAPI(api_error(500, "server_error"), envelope({"balance": 5}))
    http, _ = http_client(api)
    assert (http.request(replace(balance, retry="paid"), read_item)).model_dump() == {"balance": 5}
    assert len(api.requests) == 2


def test_it_raises_api_timeout_error_when_a_body_drips_past_the_timeout() -> None:
    http, _ = http_client(MockAPI(answer(Body(b"{", gap=0.02, forever=True))), timeout=0.2, max_retries=0)
    with pytest.raises(APITimeoutError, match=r"^Request timed out after 0\.2 s\.$"):
        http.request(balance, read_item)


def test_it_times_out_an_error_answer_whose_body_drips() -> None:
    http, _ = http_client(MockAPI(answer(Body(b"{", gap=0.02, forever=True), 503)), timeout=0.2, max_retries=0)
    with pytest.raises(APITimeoutError):
        http.request(balance, read_item)


def test_it_uses_a_call_s_timeout_over_the_client_s() -> None:
    http, _ = http_client(MockAPI(answer(Body(b"{", gap=0.02, forever=True))), timeout=60, max_retries=0)
    with pytest.raises(APITimeoutError):
        http.request(replace(balance, options=RequestOptions(timeout=0.2)), read_item)


def test_it_retries_a_timeout_on_a_safe_call_but_not_on_a_paid_one() -> None:
    safe = MockAPI(answer(Body(b"{", gap=0.02, forever=True)), envelope({"ok": True}))
    assert (http_client(safe, timeout=0.2)[0].request(balance, read_item)).model_dump() == {"ok": True}
    assert len(safe.requests) == 2
    paid = MockAPI(answer(Body(b"{", gap=0.02, forever=True)), envelope({"ok": True}))
    with pytest.raises(APITimeoutError):
        http_client(paid, timeout=0.2)[0].request(replace(balance, retry="paid"), read_item)
    assert len(paid.requests) == 1


def test_it_closes_every_answer_it_reads() -> None:
    success, failure = Body(b'{"data": {}, "request_id": "r"}'), Body(b"{}")
    http, _ = http_client(MockAPI(answer(success), answer(failure, 404)))
    http.request(balance, read_item)
    with pytest.raises(NotFoundError):
        http.request(balance, read_item)
    assert (success.closed, failure.closed) == (True, True)


def test_a_connection_error_says_what_failed_and_keeps_the_cause() -> None:
    failure = refused()
    http, _ = http_client(MockAPI(failure), max_retries=0)
    with pytest.raises(APIConnectionError) as caught:
        http.request(balance, read_item)
    assert type(caught.value) is APIConnectionError
    assert str(caught.value) == "Connection error: [Errno 111] Connection refused"
    assert caught.value.__cause__ is failure


def test_a_connection_error_with_an_empty_message_says_what_failed_underneath() -> None:
    failure = httpx.ConnectError("")
    failure.__cause__ = ConnectionRefusedError(111, "Connection refused")
    http, _ = http_client(MockAPI(failure), max_retries=0)
    with pytest.raises(APIConnectionError, match=r"^Connection error: \[Errno 111\] Connection refused$"):
        http.request(balance, read_item)


def test_a_connection_that_drops_while_the_answer_arrives_says_so() -> None:
    dropped = Body(b'{"data": {', error=httpx.RemoteProtocolError("peer closed connection without sending body"))
    http, _ = http_client(MockAPI(answer(dropped)), max_retries=0)
    with pytest.raises(APIConnectionError) as caught:
        http.request(balance, read_item)
    assert str(caught.value) == (
        "The connection failed while the response arrived: peer closed connection without sending body"
    )
    assert dropped.closed


def test_it_sends_the_caller_s_idempotency_key_the_same_on_every_retry() -> None:
    api = MockAPI(api_error(500, "server_error"), reset(), envelope({"id": "job-1"}))
    http, _ = http_client(api)
    http.request(replace(create_job, options=RequestOptions(idempotency_key="order-42")), read_item)
    assert [request.headers["idempotency-key"] for request in api.requests] == ["order-42"] * 3


def test_the_call_s_key_goes_over_a_client_wide_default_and_extra_headers_over_both() -> None:
    api = MockAPI(envelope({}), envelope({}), envelope({}))
    http, _ = http_client(api, default_headers={"idempotency-key": "shared"})
    http.request(replace(create_job, options=RequestOptions(idempotency_key="order-42")), read_item)
    http.request(create_job, read_item)
    extra = RequestOptions(idempotency_key="order-43", extra_headers={"idempotency-key": "extra"})
    http.request(replace(create_job, options=extra), read_item)
    own, generated, over = (request.headers["idempotency-key"] for request in api.requests)
    assert own == "order-42"
    assert UUID_V4.fullmatch(generated)
    assert over == "extra"


def test_it_generates_a_uuid4_when_the_caller_gives_none_and_reuses_it_on_every_retry() -> None:
    api = MockAPI(api_error(503, "service_unavailable"), envelope({}))
    http, _ = http_client(api)
    http.request(replace(create_job, options=RequestOptions(idempotency_key="")), read_item)
    first, second = (request.headers["idempotency-key"] for request in api.requests)
    assert UUID_V4.fullmatch(first)
    assert second == first


def test_each_call_gets_its_own_generated_key() -> None:
    api = MockAPI(envelope({}), envelope({}))
    http, _ = http_client(api)
    http.request(create_job, read_item)
    http.request(create_job, read_item)
    assert api.requests[0].headers["idempotency-key"] != api.requests[1].headers["idempotency-key"]


def test_calls_of_other_classes_send_no_idempotency_key() -> None:
    api = MockAPI(envelope({}), envelope({}))
    http, _ = http_client(api)
    http.request(replace(create_job, retry="paid", options=RequestOptions(idempotency_key="ignored")), read_item)
    http.request(balance, read_item)
    assert all("idempotency-key" not in request.headers for request in api.requests)
    assert body_of(api.requests[0]) == {"text": "Salom"}


def test_the_api_key_never_appears_in_an_error_however_it_is_printed() -> None:
    replies: list[Reply] = [
        refused(),
        answer(Body(b"{", gap=0.02, forever=True)),
        api_error(401, "invalid_api_key"),
        json_response(200, []),
    ]
    for reply in replies:
        http, _ = http_client(MockAPI(reply), timeout=0.2, max_retries=0)
        with pytest.raises(NeuronAIError) as caught:
            http.request(balance, read_item)
        assert KEY not in printed(caught.value)


def test_the_api_key_is_redacted_from_a_success_that_isn_t_what_the_call_returns() -> None:
    echo = httpx.Response(200, content=f"<pre>Authorization: Bearer {KEY}</pre>".encode())
    http, _ = http_client(MockAPI(echo))
    with pytest.raises(APIError) as caught:
        http.request(balance, read_item)
    assert caught.value.message == "OK: <pre>Authorization: Bearer [redacted]</pre>"


def test_the_api_key_is_redacted_from_an_error_whose_body_echoes_it_back() -> None:
    echo = httpx.Response(502, content=f"<pre>Authorization: Bearer {KEY}</pre>".encode())
    http, _ = http_client(MockAPI(echo), max_retries=0)
    with pytest.raises(APIError) as caught:
        http.request(balance, read_item)
    assert caught.value.message == "Bad Gateway: <pre>Authorization: Bearer [redacted]</pre>"
    assert KEY not in printed(caught.value)


def test_no_frame_of_the_sdk_that_an_error_passes_through_holds_the_key() -> None:
    """An error tracker that records each frame's locals, as many do, must never record the key."""
    replies: list[Reply] = [api_error(404, "not_found"), refused(), answer(Body(b"{", gap=0.02, forever=True))]
    for reply in replies:
        http, _ = http_client(MockAPI(reply), timeout=0.2, max_retries=0)
        with pytest.raises(NeuronAIError) as caught:
            http.request(balance, read_item)
        frames = sdk_frames(caught.value)
        assert frames
        for frame in frames:
            assert KEY not in repr(dict(frame.f_locals)), frame.f_code.co_name


def test_it_sends_a_form_as_multipart_built_once_so_each_retry_sends_the_same_bytes_and_key() -> None:
    api = MockAPI(api_error(503, "service_unavailable"), envelope({"id": "v1"}))
    http, _ = http_client(api)
    http.request(create_voice, read_item)
    first, second = api.requests
    assert first.headers["content-type"].startswith("multipart/form-data; boundary=")
    assert (second.content, second.headers["content-type"]) == (first.content, first.headers["content-type"])
    assert second.headers["idempotency-key"] == first.headers["idempotency-key"]
    assert form_of(first) == {"fields": {"name": "Office voice", "tags": ["support"]}, "files": {"ref_audio": clip}}


def test_a_file_object_in_a_form_is_read_once_so_a_retry_sends_the_whole_file_again(tmp_path: Path) -> None:
    path = tmp_path / "sample.wav"
    path.write_bytes(WAV)
    api = MockAPI(reset(), envelope({}))
    http, _ = http_client(api)
    with path.open("rb") as file:
        http.request(replace(create_voice, form=Form({"ref_audio": file}, ("ref_audio",))), read_item)
    assert [form_of(request)["files"] for request in api.requests] == [{"ref_audio": clip}] * 2


def test_it_refuses_bytes_without_a_filename_in_a_form_sending_nothing() -> None:
    api = MockAPI()
    http, _ = http_client(api)
    with pytest.raises(NeuronAIError, match=r'^ref_audio needs a filename: pass \("clip\.wav", data\)'):
        http.request(replace(create_voice, form=Form({"ref_audio": WAV}, ("ref_audio",))), read_item)
    assert api.requests == []


@pytest.mark.parametrize("where", ["default_headers", "extra_headers"])
def test_no_frame_of_the_sdk_holds_the_key_when_a_header_is_refused(where: str) -> None:
    """A header that can't be sent is refused before the key joins the headers: its error holds no frame with it."""
    bad = {"x-trace": "abc\n"}
    http, _ = http_client(MockAPI(), default_headers=bad if where == "default_headers" else None)
    request = replace(balance, options=RequestOptions(extra_headers=bad)) if where == "extra_headers" else balance
    with pytest.raises(NeuronAIError, match="x-trace") as caught:
        http.request(request, read_item)
    frames = sdk_frames(caught.value)
    assert frames
    for frame in frames:
        assert KEY not in repr(dict(frame.f_locals)), frame.f_code.co_name


def test_a_caller_s_own_authorization_header_goes_on_over_the_sdk_s() -> None:
    api = MockAPI(envelope({"ok": True}), envelope({"ok": True}))
    http, _ = http_client(api, default_headers={"Authorization": "Bearer from-defaults"})
    http.request(balance, read_item)
    call = replace(balance, options=RequestOptions(extra_headers={"authorization": "Bearer call"}))
    http.request(call, read_item)
    assert [request.headers["authorization"] for request in api.requests] == ["Bearer from-defaults", "Bearer call"]
