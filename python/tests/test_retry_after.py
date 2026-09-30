from datetime import datetime, timezone

import pytest

from naiuz._retry_after import parse_retry_after

NOW = datetime(2026, 9, 29, 10, 0, 0, tzinfo=timezone.utc).timestamp()


def test_it_reads_seconds() -> None:
    assert parse_retry_after("12", NOW) == 12
    assert parse_retry_after(" 0 ", NOW) == 0
    assert parse_retry_after("1.5", NOW) == 1.5


def test_it_reads_an_http_date_as_the_seconds_from_now_rounded_up() -> None:
    assert parse_retry_after("Tue, 29 Sep 2026 10:00:30 GMT", NOW) == 30
    assert parse_retry_after("Tue, 29 Sep 2026 10:00:30 GMT", NOW + 0.5) == 30
    assert parse_retry_after("Tue, 29 Sep 2026 10:30:00 GMT", NOW) == 1800


def test_it_never_gives_less_than_0_for_a_date_already_past() -> None:
    assert parse_retry_after("Tue, 29 Sep 2026 09:59:00 GMT", NOW) == 0


@pytest.mark.parametrize("value", [None, "", "soon", "-1", "12s", "1e3", "Tue, 99 Foo 2026"])
def test_it_gives_none_for_no_header_or_one_it_can_t_read(value: str | None) -> None:
    assert parse_retry_after(value, NOW) is None
