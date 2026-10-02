"""The HTTP core: every call of the client goes through it."""

from __future__ import annotations

import random as random_module
import time
from collections.abc import Callable, Mapping
from typing import TypeVar

import httpx

from .._errors import APITimeoutError, connection_error, make_api_error
from .._request import APIRequest, build_headers, check_max_retries, check_timeout, encode_body, with_key
from .._response import Answer, Answered, Attempt, Failed, Reader, record, unusable
from .._retry import ConnectionFailure, StatusFailure, TimeoutFailure, failed_before_sending, is_retryable, retry_delay
from .._retry_after import parse_retry_after
from .._url import build_url, query_items
from . import _io

T = TypeVar("T")


def attempt_timeout(timeout: float) -> httpx.Timeout:
    """httpx's own timeouts for an attempt of `timeout` seconds.

    Waiting for a pooled connection and connecting end a little before the attempt's deadline, so running out of
    time there raises httpx's PoolTimeout or ConnectTimeout, which say that nothing was sent: every retry class may
    retry that. Writing the request and reading the answer get the whole timeout.
    """
    early = timeout - min(timeout / 10, 1.0)
    return httpx.Timeout(timeout, connect=early, pool=early)


class AsyncHttpClient:
    """Sends API calls.

    It builds each request, runs each attempt within its timeout, retries as the call's class allows, and turns error
    answers into APIError subclasses. Resources hold one and describe their calls to it.
    """

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout: float,
        max_retries: int,
        default_headers: Mapping[str, str],
        user_agent: str,
        client: httpx.AsyncClient,
        sleep: _io.Sleep | None = None,
        random: Callable[[], float] | None = None,
        clock: Callable[[], float] | None = None,
        monotonic: Callable[[], float] | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._timeout = timeout
        self._max_retries = max_retries
        self._default_headers = dict(default_headers)
        self._user_agent = user_agent
        self._client = client
        self._sleep = _io.sleep if sleep is None else sleep
        """Waits between attempts."""
        self._random = random_module.random if random is None else random
        """The jitter's random source, in [0, 1)."""
        self._clock = time.time if clock is None else clock
        """The time in Unix seconds, for Retry-After dates."""
        self._monotonic = time.monotonic if monotonic is None else monotonic
        """The time for deadlines."""

    @property
    def timeout(self) -> float:
        """Seconds each attempt may take, unless a call passes its own `timeout`."""
        return self._timeout

    def monotonic(self) -> float:
        """The time, in seconds, for deadlines."""
        return self._monotonic()

    async def sleep(self, seconds: float) -> None:
        """Waits, as the client waits between attempts."""
        await self._sleep(seconds)

    async def request(self, request: APIRequest, reader: Reader[T] | _io.TakeOver[T]) -> T:
        """Sends the call, retrying as its class allows, and returns what `reader` makes of the answer."""
        options = request.options
        timeout = check_timeout(self._timeout if options.timeout is None else options.timeout)
        max_retries = check_max_retries(self._max_retries if options.max_retries is None else options.max_retries)
        content, content_type = encode_body(request)
        # Built once, so every retry sends the same Idempotency-Key and the same body. The headers go straight in, so
        # no local of this frame holds the key for an error tracker that records locals.
        http_request = self._client.build_request(
            request.method,
            build_url(self._base_url, request.path, request.path_params),
            params=query_items(request.query),
            headers=with_key(
                build_headers(
                    user_agent=self._user_agent,
                    default_headers=self._default_headers,
                    request=request,
                    content_type=content_type,
                ),
                self._api_key,
            ),
            content=content,
            timeout=attempt_timeout(timeout),
        )
        retry = 0
        while True:
            outcome = await self._attempt(http_request, reader, timeout)
            if isinstance(outcome, Answered):
                record(outcome.status, outcome.headers)
                return outcome.value
            allowed = retry < max_retries and is_retryable(request.retry, outcome.failure)
            delay = retry_delay(retry, outcome.retry_after, self._random) if allowed else None
            if delay is None:
                raise outcome.error
            await self._sleep(delay)
            retry += 1

    async def _attempt(
        self, http_request: httpx.Request, reader: Reader[T] | _io.TakeOver[T], timeout: float
    ) -> Answered[T] | Failed:
        """One attempt: the request, then its whole answer, within `timeout` seconds."""
        stop_at = self._monotonic() + timeout
        reading = False
        try:
            async with _io.deadline(timeout) as deadline:
                response = await self._client.send(http_request, stream=True)
                reading = True
                if response.is_success and isinstance(reader, _io.TakeOver) and reader.takes(response.headers):
                    deadline.disarm()
                    return await self._hand_over(response, reader, timeout)
                try:
                    content = await self._read(response, stop_at)
                finally:
                    await response.aclose()
        except (TimeoutError, httpx.TimeoutException) as cause:
            timed_out = APITimeoutError(f"Request timed out after {timeout:g} s.")
            timed_out.__cause__ = cause
            # Connecting, or waiting for a pooled connection, timed out: nothing was sent.
            unsent = isinstance(cause, httpx.ConnectTimeout | httpx.PoolTimeout)
            return Failed(timed_out, ConnectionFailure(before_send=True) if unsent else TimeoutFailure(), None)
        except httpx.RequestError as cause:
            failure = ConnectionFailure(before_send=not reading and failed_before_sending(cause))
            return Failed(connection_error(cause, reading=reading), failure, None)
        status, reason, headers = response.status_code, response.reason_phrase, response.headers
        answer = Answer(status, reason, headers, content, self._redact)
        if response.is_success:
            if isinstance(reader, _io.TakeOver):
                # A reader that takes answers over was handed one it takes, above: this one isn't.
                raise unusable(answer)
            return Answered(reader(answer), status, headers)
        now = self._clock()
        error = make_api_error(status, reason, headers, self._redact(answer.text()), now)
        retry_after = parse_retry_after(headers.get("retry-after"), now)
        return Failed(error, StatusFailure(status, enveloped=error.code is not None), retry_after)

    async def _hand_over(self, response: httpx.Response, reader: _io.TakeOver[T], timeout: float) -> Answered[T]:
        """Hands the open answer to a reader that takes it over, and closes it only if the reader fails."""
        try:
            value = await reader.take(response, Attempt(timeout, self._redact))
        except BaseException:
            await response.aclose()
            raise
        return Answered(value, response.status_code, response.headers)

    async def _read(self, response: httpx.Response, stop_at: float) -> bytes:
        """The answer's whole body. Past `stop_at` it raises TimeoutError, so a body that drips in can't outlast it."""
        if self._monotonic() >= stop_at:
            raise TimeoutError
        chunks: list[bytes] = []
        async for chunk in response.aiter_bytes():
            if self._monotonic() >= stop_at:
                raise TimeoutError
            chunks.append(chunk)
        return b"".join(chunks)

    def _redact(self, text: str) -> str:
        """The text with every occurrence of the API key replaced, so a page that echoes the request back can't put
        the key into an error."""
        return text.replace(self._api_key, "[redacted]")
