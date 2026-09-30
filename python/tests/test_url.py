import httpx
import pytest

from naiuz import NeuronAIError
from naiuz._url import build_url, encode_path_param, query_items

BASE_URL = "https://my.neuronai.uz/api/v1"


def test_encode_path_param_leaves_rfc_3986_s_unreserved_characters_alone() -> None:
    assert encode_path_param("AZaz09-._~") == "AZaz09-._~"


def test_encode_path_param_escapes_everything_else_as_utf_8() -> None:
    assert encode_path_param("it's (1)*!") == "it%27s%20%281%29%2A%21"
    assert encode_path_param("a/b?c#d") == "a%2Fb%3Fc%23d"
    assert encode_path_param("ovoz é") == "ovoz%20%C3%A9"


def test_build_url_joins_the_base_url_and_the_path_filling_in_encoded_parameters() -> None:
    assert build_url(BASE_URL, "/tts/voices/{id}", {"id": "voice (1)"}) == f"{BASE_URL}/tts/voices/voice%20%281%29"
    assert build_url(BASE_URL, "/api-keys/{id}/revoke", {"id": "01j9"}) == f"{BASE_URL}/api-keys/01j9/revoke"


def test_build_url_ignores_trailing_slashes_on_the_base_url() -> None:
    assert build_url(f"{BASE_URL}//", "/balance") == f"{BASE_URL}/balance"


@pytest.mark.parametrize("value", ["", ".", ".."])
def test_build_url_refuses_a_path_parameter_that_would_name_another_endpoint(value: str) -> None:
    with pytest.raises(NeuronAIError, match=r'^The path parameter "id" must be a non-empty string other than'):
        build_url(BASE_URL, "/tts/voices/{id}", {"id": value})


def test_build_url_refuses_a_path_parameter_that_isn_t_a_string_or_is_missing() -> None:
    not_a_string: dict[str, str] = {"id": 42}  # type: ignore[dict-item]  # pyright: ignore[reportAssignmentType]
    with pytest.raises(NeuronAIError):
        build_url(BASE_URL, "/tts/voices/{id}", not_a_string)
    with pytest.raises(NeuronAIError):
        build_url(BASE_URL, "/tts/voices/{id}", {})


def test_query_items_leave_none_out_and_send_the_rest_as_text() -> None:
    query = {"type": "custom", "language": None, "limit": 2, "cursor": None, "flag": False}
    assert query_items(query) == (("type", "custom"), ("limit", "2"), ("flag", "false"))
    assert query_items(None) == ()


def test_an_opaque_cursor_goes_back_exactly_as_it_came() -> None:
    cursor = "eyJpZCI6IjAxaiJ9+/=&x y"
    request = httpx.Request("GET", f"{BASE_URL}/tts/voices", params=query_items({"cursor": cursor}))
    assert request.url.params["cursor"] == cursor
