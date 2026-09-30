import json
from datetime import datetime, timezone

import httpx
import pytest

from naiuz import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    ConflictError,
    GoneError,
    InsufficientQuotaError,
    InternalServerError,
    NeuronAIError,
    NotFoundError,
    PayloadTooLargeError,
    PermissionDeniedError,
    RateLimitError,
    UnprocessableEntityError,
    UnsupportedMediaTypeError,
)
from naiuz._errors import connection_error, make_api_error, root_message

NOW = datetime(2026, 9, 29, 10, 0, 0, tzinfo=timezone.utc).timestamp()


def envelope(code: str, **extra: object) -> str:
    error = {"type": "invalid_request_error", "code": code, "message": "Something went wrong.", "param": None, **extra}
    return json.dumps({"error": error, "request_id": "req-1"})


def test_every_error_is_a_neuronai_error_and_a_timeout_is_a_connection_error() -> None:
    timeout = APITimeoutError()
    assert isinstance(timeout, APIConnectionError)
    assert isinstance(timeout, NeuronAIError)
    assert isinstance(make_api_error(404, "Not Found", httpx.Headers(), envelope("not_found")), NeuronAIError)
    assert str(timeout) == "Request timed out."
    assert str(APIConnectionError()) == "Connection error."


@pytest.mark.parametrize(
    ("status", "error_class"),
    [
        (400, BadRequestError),
        (401, AuthenticationError),
        (402, InsufficientQuotaError),
        (403, PermissionDeniedError),
        (404, NotFoundError),
        (409, ConflictError),
        (410, GoneError),
        (413, PayloadTooLargeError),
        (415, UnsupportedMediaTypeError),
        (422, UnprocessableEntityError),
        (429, RateLimitError),
        (500, InternalServerError),
        (502, InternalServerError),
        (503, InternalServerError),
        (599, InternalServerError),
    ],
)
def test_a_status_raises_its_own_class(status: int, error_class: type[APIError]) -> None:
    error = make_api_error(status, "", httpx.Headers(), envelope("server_error"))
    assert type(error) is error_class
    assert error.status == status


@pytest.mark.parametrize("status", [200, 405, 418, 451])
def test_any_other_status_raises_api_error_itself(status: int) -> None:
    assert type(make_api_error(status, "", httpx.Headers(), envelope("method_not_allowed"))) is APIError


def test_an_error_in_the_envelope_carries_its_details_and_the_headers() -> None:
    headers = httpx.Headers({"x-request-id": "req-1"})
    body = json.dumps(
        {
            "error": {
                "type": "invalid_request_error",
                "code": "invalid_request",
                "message": "The text field is required.",
                "param": "text",
                "fields": {"text": "The text field is required.", "odd": 1},
            },
            "request_id": "req-1",
        }
    )
    error = make_api_error(422, "Unprocessable Content", headers, body)
    assert isinstance(error, UnprocessableEntityError)
    assert (error.type, error.code, error.message, error.param) == (
        "invalid_request_error",
        "invalid_request",
        "The text field is required.",
        "text",
    )
    assert error.fields == {"text": "The text field is required."}
    assert error.request_id == "req-1"
    assert error.headers is headers
    assert str(error) == "The text field is required."


def test_a_code_the_sdk_doesn_t_know_stays_a_plain_string() -> None:
    assert make_api_error(400, "", httpx.Headers(), envelope("brand_new_code")).code == "brand_new_code"


def test_fields_is_none_unless_the_envelope_sends_them() -> None:
    assert make_api_error(404, "", httpx.Headers(), envelope("not_found")).fields is None


def test_the_request_id_falls_back_to_x_request_id() -> None:
    body = json.dumps(
        {"error": {"type": "invalid_request_error", "code": "not_found", "message": "No.", "param": None}}
    )
    error = make_api_error(404, "", httpx.Headers({"x-request-id": "req-header"}), body)
    assert error.request_id == "req-header"


def test_an_answer_outside_the_envelope_still_raises_its_class_with_the_reason_and_the_body_s_start() -> None:
    html = f"<html><head><title>502 Bad Gateway</title></head><body>{'x' * 300}</body></html>"
    error = make_api_error(502, "Bad Gateway", httpx.Headers({"x-request-id": "req-proxy"}), html)
    assert isinstance(error, InternalServerError)
    assert (error.code, error.type, error.param, error.fields) == (None, None, None, None)
    assert error.message == f"Bad Gateway: {html[:200]}"
    assert error.request_id == "req-proxy"


def test_an_empty_answer_without_a_reason_still_says_what_happened() -> None:
    error = make_api_error(503, "", httpx.Headers(), "")
    assert isinstance(error, InternalServerError)
    assert error.message == "HTTP 503"
    assert error.request_id is None


def test_json_that_isn_t_the_envelope_is_like_any_other_body() -> None:
    error = make_api_error(500, "Internal Server Error", httpx.Headers(), '{"message":"Server Error"}')
    assert error.code is None
    assert error.message == 'Internal Server Error: {"message":"Server Error"}'


def test_retry_after_is_the_header_s_seconds_on_a_429() -> None:
    error = make_api_error(429, "", httpx.Headers({"retry-after": "12"}), envelope("rate_limit_exceeded"), NOW)
    assert isinstance(error, RateLimitError)
    assert error.retry_after == 12


def test_retry_after_counts_an_http_date_from_now() -> None:
    headers = httpx.Headers({"retry-after": "Tue, 29 Sep 2026 10:00:05 GMT"})
    error = make_api_error(429, "", headers, envelope("rate_limit_exceeded"), NOW)
    assert isinstance(error, RateLimitError)
    assert error.retry_after == 5


def test_retry_after_is_none_on_a_429_without_the_header() -> None:
    error = make_api_error(429, "", httpx.Headers(), envelope("concurrency_limit_exceeded"), NOW)
    assert isinstance(error, RateLimitError)
    assert error.retry_after is None


def test_root_message_finds_the_deepest_message() -> None:
    error = httpx.ConnectError("")
    error.__cause__ = httpx.ConnectError("All connection attempts failed")
    error.__cause__.__cause__ = ConnectionRefusedError(111, "Connection refused")
    assert root_message(error) == "[Errno 111] Connection refused"


def test_root_message_looks_inside_grouped_errors_when_the_group_s_own_message_is_empty() -> None:
    class Grouped(Exception):
        def __init__(self, *inner: BaseException) -> None:
            super().__init__("")
            self.exceptions = inner

    grouped = Grouped(OSError(""), OSError("connect to ::1 failed"))
    assert root_message(grouped) == "connect to ::1 failed"


def test_root_message_bounds_a_cause_that_refers_back_to_itself() -> None:
    looping = RuntimeError("")
    looping.__cause__ = looping
    assert root_message(looping) == ""


def test_connection_error_says_what_failed_and_keeps_the_cause() -> None:
    cause = httpx.ConnectError("[Errno 111] Connection refused")
    error = connection_error(cause, reading=False)
    assert isinstance(error, APIConnectionError)
    assert str(error) == "Connection error: [Errno 111] Connection refused"
    assert error.__cause__ is cause
    assert str(connection_error(httpx.ReadError(""), reading=False)) == "Connection error."
    dropped = connection_error(httpx.RemoteProtocolError("peer closed connection"), reading=True)
    assert str(dropped) == "The connection failed while the response arrived: peer closed connection"
