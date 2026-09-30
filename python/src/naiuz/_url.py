"""The URL of one call."""

from __future__ import annotations

import re
from collections.abc import Mapping
from urllib.parse import quote

from ._errors import NeuronAIError

QueryValue = str | int | float | bool | None
"""A query parameter's value. None is left out of the URL."""

_PARAMETER = re.compile(r"\{([^}]+)\}")


def encode_path_param(value: str) -> str:
    """A path parameter, percent-encoded per RFC 3986.

    Every character outside the unreserved set (A-Z a-z 0-9 - . _ ~) becomes UTF-8 %XX.
    """
    return quote(value, safe="")


def build_url(base_url: str, path: str, path_params: Mapping[str, str] | None = None) -> str:
    """The URL of one call: the base URL, then the path with each `{name}` replaced by its encoded parameter.

    A path parameter that is empty, "." or ".." is refused, because the URL would then name another endpoint.
    """
    given: Mapping[str, object] = path_params or {}

    def fill(match: re.Match[str]) -> str:
        name = match.group(1)
        value = given.get(name)
        if not isinstance(value, str) or value in ("", ".", ".."):
            raise NeuronAIError(f'The path parameter "{name}" must be a non-empty string other than "." and "..".')
        return encode_path_param(value)

    return base_url.rstrip("/") + _PARAMETER.sub(fill, path)


def query_items(query: Mapping[str, QueryValue] | None) -> tuple[tuple[str, str], ...]:
    """A call's query as name-value pairs, in order.

    None is left out, a boolean is sent as `true` or `false`, and anything else as its text.
    """
    return tuple(
        (name, ("true" if value else "false") if isinstance(value, bool) else str(value))
        for name, value in (query or {}).items()
        if value is not None
    )
