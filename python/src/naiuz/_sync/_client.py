# Written by scripts/unasync.py from src/naiuz/_async/_client.py. Edit that file, then run the script.
"""The NeuronAI API client."""

from __future__ import annotations

from collections.abc import Mapping
from types import TracebackType
from typing import TypeVar

import httpx

from .._errors import NeuronAIError
from .._options import DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT, resolve_api_key, resolve_base_url, user_agent
from .._request import check_max_retries, check_timeout
from ._http import HttpClient
from .resources.account import Account
from .resources.tts import Tts
from .resources.voices import Voices

_Client = TypeVar("_Client", bound="NeuronAI")


class NeuronAI:
    """The NeuronAI API client.

    Every method takes, besides its own arguments, `timeout` (seconds each attempt may take, reading the answer
    included), `max_retries`, and `extra_headers` (headers that go on over the SDK's own and `default_headers`). The
    calls that send an Idempotency-Key also take `idempotency_key`. Each resource's `with_raw_response` has the same
    methods, returning a RawResponse: the result with its answer's status and headers.
    """

    base_url: str
    """The API's address, without a trailing slash."""
    timeout: float
    """Seconds each attempt may take, unless a call passes its own `timeout`."""
    max_retries: int
    """How many times a failed attempt is retried, unless a call passes its own `max_retries`."""
    account: Account
    """Your organization's balance and usage."""
    voices: Voices
    """Stock voices and your organization's voice clones."""
    tts: Tts
    """Text to speech."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        default_headers: Mapping[str, str] | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        """Raises NeuronAIError at once when there is no API key, or when an option is invalid.

        Args:
            api_key: Your API key (`nai_...`). Defaults to the NEURONAI_API_KEY environment variable.
            base_url: The API's address. Defaults to NEURONAI_BASE_URL, then to `https://my.neuronai.uz/api/v1`.
            timeout: Seconds each attempt may take, reading the answer included: 300 (5 minutes) by default. A long
                dialogue, or a voice update that re-creates the voice, can take longer: pass a longer `timeout`.
            max_retries: How many times a failed attempt may be retried: 2 by default.
            default_headers: Headers sent with every call, over the SDK's own. A call's Idempotency-Key and
                `extra_headers` go on over them.
            http_client: The httpx client to send with, for proxies and tests. Each call still gets the SDK's own
                timeout. It stays yours to close: `close()` closes only a client the SDK made.
        """
        key = resolve_api_key(api_key)
        self.base_url = resolve_base_url(base_url)
        self.timeout = check_timeout(DEFAULT_TIMEOUT if timeout is None else timeout)
        self.max_retries = check_max_retries(DEFAULT_MAX_RETRIES if max_retries is None else max_retries)
        # Checked for a caller without a type checker, who may pass the other client's kind.
        if http_client is not None and not isinstance(http_client, httpx.Client):  # pyright: ignore[reportUnnecessaryIsInstance]
            raise NeuronAIError("http_client must be an httpx." + httpx.Client.__name__ + ".")
        self._owns_client = http_client is None
        self._client = httpx.Client() if http_client is None else http_client
        http = HttpClient(
            api_key=key,
            base_url=self.base_url,
            timeout=self.timeout,
            max_retries=self.max_retries,
            default_headers=dict(default_headers or {}),
            user_agent=user_agent(),
            client=self._client,
        )
        self.account = Account(http)
        self.voices = Voices(http)
        self.tts = Tts(http)

    def close(self) -> None:
        """Closes the httpx client the SDK made. One given as `http_client` stays open: it is yours to close."""
        if self._owns_client:
            self._client.close()

    def __enter__(self: _Client) -> _Client:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    def __repr__(self) -> str:
        return f"{type(self).__name__}(base_url={self.base_url!r})"
