# Written by scripts/unasync.py from src/naiuz/_async/_resource.py. Edit that file, then run the script.
"""The base of every resource."""

from __future__ import annotations

from ._http import HttpClient


class APIResource:
    """A group of the API's calls, which it sends through the client's HTTP core."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http
