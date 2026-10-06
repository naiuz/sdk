# Written by scripts/unasync.py from src/naiuz/_async/resources/account.py. Edit that file, then run the script.
"""Your organization's balance and usage."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from ..._request import APIRequest, RequestOptions
from ..._response import read_envelope
from ...types.account import Balance, Usage
from .._io import to_raw
from .._resource import APIResource


class Account(APIResource):
    """Your organization's balance and usage."""

    @property
    def with_raw_response(self) -> AccountWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AccountWithRawResponse(self)

    def balance(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Balance:
        """The remaining credits of the calling key's organization, and its prices.

        Use it to surface a low balance before a request fails with 402.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        return self._http.request(APIRequest("GET", "/balance", "safe", options=options), read_envelope(Balance))

    def usage(
        self,
        *,
        days: Literal[7, 30, 90] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Usage:
        """Spend and request counts of the calling key's organization, grouped by service and by API key.

        Reading usage is free.

        Args:
            days: How many days to count, today included: 7, 30 or 90 (30 when left out).
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/usage", "safe", query={"days": days}, options=options)
        return self._http.request(request, read_envelope(Usage))


class AccountWithRawResponse:
    """The account's methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, account: Account) -> None:
        self.balance = to_raw(account.balance)
        self.usage = to_raw(account.usage)
