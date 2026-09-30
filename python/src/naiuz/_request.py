"""What a resource hands the HTTP core for one call, and the checks it makes before anything is sent."""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Final, Literal

from ._errors import NeuronAIError
from ._retry import RetryClass
from ._url import QueryValue


class NotGiven:
    """The type of NOT_GIVEN."""

    def __bool__(self) -> Literal[False]:
        return False

    def __repr__(self) -> str:
        return "NOT_GIVEN"


NOT_GIVEN: Final = NotGiven()
"""The default of every optional field of a request body: the field is left out. Pass None to send null instead."""


def given(**fields: object) -> dict[str, object]:
    """A request body from the caller's fields: each one left NOT_GIVEN is left out, and None stays, sent as null."""
    return {name: value for name, value in fields.items() if not isinstance(value, NotGiven)}


@dataclass(frozen=True)
class RequestOptions:
    """The options every method takes for its own call."""

    timeout: float | None = None
    """Seconds each attempt may take, reading the answer included. None keeps the client's."""
    max_retries: int | None = None
    """How many times a failed attempt may be retried. None keeps the client's."""
    extra_headers: Mapping[str, str] | None = None
    """Headers for this call. They go on last, over the SDK's own, the client's `default_headers` and the key."""
    idempotency_key: str | None = None
    """The Idempotency-Key of an idempotent call. None or an empty string sends a generated UUIDv4."""


@dataclass(frozen=True)
class APIRequest:
    """One API call, as a resource describes it to the HTTP core."""

    method: Literal["GET", "POST", "PATCH", "DELETE"]
    path: str
    """The path under the base URL, with `{name}` for each path parameter, such as `/tts/voices/{id}`."""
    retry: RetryClass
    """Which failures are retried, and whether an Idempotency-Key is sent (`idempotent`)."""
    path_params: Mapping[str, str] = field(default_factory=dict[str, str])
    query: Mapping[str, QueryValue] = field(default_factory=dict[str, QueryValue])
    """The query. None values are left out."""
    body: object = NOT_GIVEN
    """Sent as JSON, unless it is NOT_GIVEN."""
    accept: str = "application/json"
    """What the call takes back: JSON unless it answers with something else, such as audio."""
    options: RequestOptions = RequestOptions()


MAX_TIMEOUT = 2_147_483.647
"""The longest timeout, in seconds: the longest a JavaScript timer can wait, kept the same in every NeuronAI SDK."""


def check_timeout(value: object) -> float:
    """A timeout option, checked: a number of seconds, more than 0 and at most MAX_TIMEOUT."""
    if isinstance(value, bool) or not isinstance(value, int | float) or not 0 < value <= MAX_TIMEOUT:
        raise NeuronAIError(f"timeout must be a number of seconds, more than 0 and at most {MAX_TIMEOUT}.")
    return float(value)


def check_max_retries(value: object) -> int:
    """A max_retries option, checked: a whole number, 0 or more."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise NeuronAIError("max_retries must be a whole number, 0 or more.")
    return value


_NAME = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
_VALUE = re.compile(r"[\t\x20-\x7e]*")


def build_headers(
    *,
    api_key: str,
    user_agent: str,
    default_headers: Mapping[str, str],
    request: APIRequest,
) -> dict[str, str]:
    """The headers of one call.

    Each group goes on over the ones before it: the SDK's own headers, the client's `default_headers`, the call's
    Idempotency-Key, then the call's `extra_headers`. A name that isn't an HTTP token, or a value with a character
    outside visible ASCII, space and tab, raises NeuronAIError naming the header but never its value.
    """
    headers: dict[str, str] = {}

    def put(name: object, value: object) -> None:
        text = value.strip(" \t") if isinstance(value, str) else None
        if not isinstance(name, str) or not _NAME.fullmatch(name) or text is None or not _VALUE.fullmatch(text):
            # Checked here, since the HTTP layer's own error quotes the value, which may be secret.
            raise NeuronAIError(f'The header "{name}" has a name or value that HTTP can\'t carry.')
        headers[name.lower()] = text

    put("authorization", f"Bearer {api_key}")
    put("accept", request.accept)
    put("user-agent", user_agent)
    if not isinstance(request.body, NotGiven):
        put("content-type", "application/json")
    for name, value in default_headers.items():
        put(name, value)
    if request.retry == "idempotent":
        # After default_headers, so a client-wide Idempotency-Key can't give every call the same key.
        put("idempotency-key", request.options.idempotency_key or str(uuid.uuid4()))
    for name, value in (request.options.extra_headers or {}).items():
        put(name, value)
    return headers


def json_body(body: object) -> bytes:
    """The body as compact UTF-8 JSON. A value JSON can't carry, such as NaN or a set, raises NeuronAIError."""
    try:
        return json.dumps(body, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
    except (TypeError, ValueError) as error:
        problem = str(error)
    raise NeuronAIError(f"The request can't be sent as JSON: {problem}")
