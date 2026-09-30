import platform
from typing import Any

import httpx
import pytest

from naiuz import DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT, AsyncNeuronAI, NeuronAIError, __version__
from tests.helpers import BALANCE, KEY, MockAPI, envelope

from ._io import other_kind_of_client
from .clients import client_for


def on(api: MockAPI, **options: Any) -> AsyncNeuronAI:
    """A client on `api`, built with only the given options."""
    return AsyncNeuronAI(http_client=httpx.AsyncClient(transport=api.transport()), **options)


async def test_it_takes_the_key_from_api_key_else_from_neuronai_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEURONAI_API_KEY", "nai_from_env")
    api = MockAPI(envelope(BALANCE), envelope(BALANCE))
    await on(api).account.balance()
    await on(api, api_key=KEY).account.balance()
    assert [request.headers["authorization"] for request in api.requests] == ["Bearer nai_from_env", f"Bearer {KEY}"]


def test_it_fails_at_construction_not_on_the_first_call_when_there_is_no_key() -> None:
    with pytest.raises(NeuronAIError, match=r"^The API key is missing: pass api_key, or set NEURONAI_API_KEY\.$"):
        AsyncNeuronAI()
    with pytest.raises(NeuronAIError):
        AsyncNeuronAI(api_key="  ")


async def test_it_trims_the_whitespace_around_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEURONAI_API_KEY", f"  {KEY}\n")
    api = MockAPI(envelope(BALANCE))
    await on(api).account.balance()
    assert api.requests[0].headers["authorization"] == f"Bearer {KEY}"


@pytest.mark.parametrize("key", ["nai_abc def", "nai_abc\ndef", "nai_abc\x00def", "nai_ключ"])
def test_it_refuses_a_key_a_header_can_t_carry_without_quoting_it(key: str) -> None:
    with pytest.raises(NeuronAIError) as caught:
        AsyncNeuronAI(api_key=key)
    assert str(caught.value) == (
        "The API key contains a space, a line break or another character a header can't carry. Check how it was copied."
    )
    assert "abc" not in str(caught.value)


def test_it_takes_the_base_url_from_base_url_else_the_environment_else_the_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert AsyncNeuronAI(api_key=KEY).base_url == DEFAULT_BASE_URL == "https://my.neuronai.uz/api/v1"
    monkeypatch.setenv("NEURONAI_BASE_URL", " https://my.neuronai.uz/from-env/api/v1/ ")
    assert AsyncNeuronAI(api_key=KEY).base_url == "https://my.neuronai.uz/from-env/api/v1"
    option = AsyncNeuronAI(api_key=KEY, base_url="http://my.neuronai.uz/from-option/api/v1/")
    assert option.base_url == "http://my.neuronai.uz/from-option/api/v1"


@pytest.mark.parametrize(
    "base_url", ["my.neuronai.uz/api/v1", "ftp://my.neuronai.uz", "https://", "https://[my.neuronai.uz"]
)
def test_it_refuses_a_base_url_that_isn_t_an_http_or_https_url(base_url: str) -> None:
    with pytest.raises(NeuronAIError, match=r"^base_url must be an http or https URL, not "):
        AsyncNeuronAI(api_key=KEY, base_url=base_url)


def test_it_defaults_to_a_300_second_timeout_and_2_retries() -> None:
    client = AsyncNeuronAI(api_key=KEY)
    assert (client.timeout, client.max_retries) == (300.0, 2)
    assert (DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES) == (300.0, 2)


@pytest.mark.parametrize("timeout", [0, -1, float("nan"), float("inf"), 2_147_484, True, "5"])
def test_it_refuses_an_invalid_timeout(timeout: Any) -> None:
    with pytest.raises(
        NeuronAIError, match=r"^timeout must be a number of seconds, more than 0 and at most 2147483\.647\.$"
    ):
        AsyncNeuronAI(api_key=KEY, timeout=timeout)


@pytest.mark.parametrize("max_retries", [-1, 1.5, True])
def test_it_refuses_an_invalid_max_retries(max_retries: Any) -> None:
    with pytest.raises(NeuronAIError, match=r"^max_retries must be a whole number, 0 or more\.$"):
        AsyncNeuronAI(api_key=KEY, max_retries=max_retries)


def test_it_refuses_an_http_client_of_the_other_kind() -> None:
    other = other_kind_of_client()
    with pytest.raises(NeuronAIError, match=r"^http_client must be an httpx\.\w*Client\.$"):
        AsyncNeuronAI(api_key=KEY, http_client=other)  # type: ignore[arg-type]  # pyright: ignore[reportArgumentType]


async def test_it_sends_the_default_headers_with_every_call() -> None:
    api = MockAPI(envelope(BALANCE))
    await client_for(api, default_headers={"x-app": "shop"}).account.balance()
    assert api.requests[0].headers["x-app"] == "shop"


async def test_it_sends_its_user_agent() -> None:
    api = MockAPI(envelope(BALANCE))
    await client_for(api).account.balance()
    major, minor, _ = platform.python_version_tuple()
    expected = f"naiuz-python/{__version__} (Python {major}.{minor}; {platform.system()})"
    assert api.requests[0].headers["user-agent"] == expected


def test_it_never_shows_the_key_when_printed() -> None:
    client = AsyncNeuronAI(api_key=KEY)
    for printed in (repr(client), str(client), repr(vars(client)), repr(client.account), repr(vars(client.account))):
        assert KEY not in printed
    assert repr(client) == f"{type(client).__name__}(base_url='https://my.neuronai.uz/api/v1')"


async def test_it_closes_the_httpx_client_it_made_but_not_one_it_was_given() -> None:
    given = httpx.AsyncClient(transport=MockAPI().transport())
    async with AsyncNeuronAI(api_key=KEY, http_client=given) as client:
        assert isinstance(client, AsyncNeuronAI)
    assert not given.is_closed
    await given.aclose()
    made = AsyncNeuronAI(api_key=KEY)
    await made.close()
    assert made._client.is_closed  # pyright: ignore[reportPrivateUsage]
