"""The client's options: where each comes from, and the checks on it."""

from __future__ import annotations

import os
import platform
import re
from urllib.parse import urlsplit

from ._errors import NeuronAIError
from ._version import __version__

DEFAULT_BASE_URL = "https://my.neuronai.uz/api/v1"
"""The API's address when neither `base_url` nor NEURONAI_BASE_URL gives one."""

DEFAULT_TIMEOUT = 300.0
"""Seconds each attempt may take by default: 5 minutes."""

DEFAULT_MAX_RETRIES = 2
"""How many times a failed attempt is retried by default."""

_KEY = re.compile(r"[\x21-\x7e]+")
"""Visible ASCII: what a key can be. A space or a line break inside it would break the Authorization header."""


def _environment(name: str) -> str | None:
    """An environment variable, trimmed; None when it is unset or empty."""
    return os.environ.get(name, "").strip() or None


def resolve_api_key(api_key: str | None) -> str:
    """The API key: `api_key`, else NEURONAI_API_KEY, trimmed.

    Missing, or holding a character a header can't carry, it raises NeuronAIError, whose message never quotes it.
    """
    key = (_environment("NEURONAI_API_KEY") or "" if api_key is None else api_key).strip()
    if key == "":
        raise NeuronAIError("The API key is missing: pass api_key, or set NEURONAI_API_KEY.")
    if not _KEY.fullmatch(key):
        raise NeuronAIError(
            "The API key contains a space, a line break or another character a header can't carry. "
            "Check how it was copied."
        )
    return key


def resolve_base_url(base_url: str | None) -> str:
    """The API's address: `base_url`, else NEURONAI_BASE_URL, else DEFAULT_BASE_URL, without a trailing slash."""
    base = (_environment("NEURONAI_BASE_URL") or DEFAULT_BASE_URL if base_url is None else base_url).strip().rstrip("/")
    try:
        parts = urlsplit(base)
    except ValueError:
        parts = urlsplit("")
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise NeuronAIError(f'base_url must be an http or https URL, not "{base}".')
    return base


def user_agent() -> str:
    """The User-Agent the SDK sends: `naiuz-python/<version> (Python <major.minor>; <OS>)`."""
    major, minor, _ = platform.python_version_tuple()
    return f"naiuz-python/{__version__} (Python {major}.{minor}; {platform.system() or 'unknown'})"
