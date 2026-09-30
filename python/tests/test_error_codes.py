import httpx

from naiuz import ErrorCode
from naiuz._errors import make_api_error
from tests.spec import read_spec

DOCUMENTED: list[str] = read_spec("openapi.json")["components"]["schemas"]["ErrorCode"]["enum"]


def test_it_holds_exactly_the_api_s_38_codes_in_the_document_s_order() -> None:
    assert [member.value for member in ErrorCode] == DOCUMENTED
    assert len(ErrorCode) == 38


def test_each_member_is_named_after_its_code_in_upper_case() -> None:
    for member in ErrorCode:
        assert member.name == member.value.upper()


def test_a_member_equals_its_code_and_prints_as_it() -> None:
    error = make_api_error(
        402, "", httpx.Headers(), '{"error": {"code": "insufficient_balance", "message": "Top up."}}'
    )
    assert error.code == ErrorCode.INSUFFICIENT_BALANCE
    assert str(ErrorCode.NOT_FOUND) == "not_found"
    assert f"{ErrorCode.NOT_FOUND}" == "not_found"
    assert ErrorCode("rate_limit_exceeded") is ErrorCode.RATE_LIMIT_EXCEEDED
