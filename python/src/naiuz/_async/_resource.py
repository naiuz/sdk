"""The base of every resource."""

from __future__ import annotations

from ._http import AsyncHttpClient


class AsyncAPIResource:
    """A group of the API's calls, which it sends through the client's HTTP core."""

    def __init__(self, http: AsyncHttpClient) -> None:
        self._http = http
