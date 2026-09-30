import httpx
import pytest

from naiuz._retry import (
    MAX_RETRY_AFTER_SECONDS,
    AttemptFailure,
    ConnectionFailure,
    RetryClass,
    StatusFailure,
    TimeoutFailure,
    failed_before_sending,
    is_retryable,
    retry_delay,
)

CLASSES: list[RetryClass] = ["safe", "idempotent", "paid", "recreate", "once"]


@pytest.mark.parametrize(
    ("failure", "retried_by"),
    [
        (StatusFailure(429, enveloped=True), ["safe", "idempotent", "paid", "recreate", "once"]),
        (ConnectionFailure(before_send=True), ["safe", "idempotent", "paid", "recreate", "once"]),
        (StatusFailure(500, enveloped=True), ["safe", "idempotent", "paid", "recreate"]),
        (StatusFailure(502, enveloped=True), ["safe", "idempotent", "paid", "recreate"]),
        (StatusFailure(503, enveloped=True), ["safe", "idempotent", "paid", "recreate"]),
        (StatusFailure(504, enveloped=True), ["safe", "idempotent", "paid", "recreate"]),
        (StatusFailure(501, enveloped=True), ["idempotent", "paid", "recreate"]),
        (StatusFailure(507, enveloped=True), ["idempotent", "paid", "recreate"]),
        (StatusFailure(502, enveloped=False), ["safe", "idempotent"]),
        (StatusFailure(504, enveloped=False), ["safe", "idempotent"]),
        (TimeoutFailure(), ["safe", "idempotent"]),
        (ConnectionFailure(before_send=False), ["safe", "idempotent"]),
        (StatusFailure(400, enveloped=True), []),
        (StatusFailure(404, enveloped=True), []),
        (StatusFailure(409, enveloped=True), []),
        (StatusFailure(422, enveloped=True), []),
    ],
)
def test_is_retryable_follows_the_spec_s_retry_table(failure: AttemptFailure, retried_by: list[RetryClass]) -> None:
    assert [retry for retry in CLASSES if is_retryable(retry, failure)] == retried_by


def test_retry_delay_doubles_from_half_a_second() -> None:
    assert [retry_delay(retry, None, lambda: 0) for retry in range(4)] == [0.5, 1, 2, 4]


def test_retry_delay_adds_up_to_25_percent_jitter() -> None:
    assert retry_delay(0, None, lambda: 0.5) == 0.5625
    assert retry_delay(1, None, lambda: 0.999) == pytest.approx(1.24975)


def test_retry_delay_never_waits_more_than_8_seconds_however_many_retries() -> None:
    assert retry_delay(4, None, lambda: 0.999) == 8
    assert retry_delay(20, None, lambda: 0) == 8
    assert retry_delay(5000, None, lambda: 0) == 8


def test_retry_delay_waits_what_retry_after_says_instead_without_jitter() -> None:
    assert retry_delay(0, 12, lambda: 0.9) == 12
    assert retry_delay(3, 0, lambda: 0.9) == 0


def test_retry_delay_gives_up_rather_than_wait_more_than_a_minute() -> None:
    assert MAX_RETRY_AFTER_SECONDS == 60
    assert retry_delay(0, 60, lambda: 0) == 60
    assert retry_delay(0, 61, lambda: 0) is None
    assert retry_delay(0, 1800, lambda: 0) is None


@pytest.mark.parametrize(
    "error", [httpx.ConnectError("refused"), httpx.ConnectTimeout("slow"), httpx.PoolTimeout("full")]
)
def test_failed_before_sending_sees_a_connection_never_made(error: Exception) -> None:
    assert failed_before_sending(error)


@pytest.mark.parametrize(
    "error",
    [
        httpx.ReadError("reset"),
        httpx.WriteError("broken pipe"),
        httpx.RemoteProtocolError("closed"),
        httpx.ReadTimeout("slow"),
        httpx.WriteTimeout("slow"),
        httpx.ProxyError("proxy"),
        httpx.DecodingError("bad gzip"),
    ],
)
def test_failed_before_sending_counts_any_other_failure_as_possibly_sent(error: Exception) -> None:
    assert not failed_before_sending(error)
