# Written by scripts/unasync.py from src/naiuz/_async/resources/api_keys.py. Edit that file, then run the script.
"""Your organization's API keys."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope, read_nothing
from ...types.api_keys import ApiKey, ApiKeyAccess, ApiKeyPermissionsParam
from .._io import Page, paginate, to_raw
from .._resource import APIResource


class ApiKeys(APIResource):
    """Your organization's API keys."""

    @property
    def with_raw_response(self) -> ApiKeysWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return ApiKeysWithRawResponse(self)

    def list(
        self,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Page[ApiKey]:
        """Your organization's keys, newest first, revoked ones included.

        Loop over the result for every key, each page fetched when the loop reaches it.

        Args:
            limit: Keys per page, from 1 to 100 (50 when left out).
            cursor: A page's `next_cursor`, to start from the page after it. Cursors are opaque: don't build them.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query = {"limit": limit, "cursor": cursor}
        return paginate(self._http, APIRequest("GET", "/api-keys", "safe", query=query, options=options), ApiKey)

    def create(
        self,
        *,
        name: str,
        access: ApiKeyAccess,
        description: str | NotGiven | None = NOT_GIVEN,
        permissions: ApiKeyPermissionsParam | NotGiven = NOT_GIVEN,
        expires_at: str | NotGiven | None = NOT_GIVEN,
        monthly_spend_limit: float | NotGiven | None = NOT_GIVEN,
        allowed_ips: Sequence[str] | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ApiKey:
        """Creates a key, and returns it with its `secret`: the only time the secret is shown, so store it now.

        The new key never holds more than the calling key. Only a 429, or a connection that was never made, is
        retried, since a retry could create a second key.

        Args:
            name: From 1 to 80 characters.
            access: `full` or `restricted`.
            description: Up to 500 characters.
            permissions: Levels by product, such as `{"tts": "write"}`. On a `restricted` key a product left out is
                `none`. A `full` key already holds every other product at its highest level, so its map may name
                only `api_keys`.
            expires_at: When the key stops working (ISO 8601), or None for never.
            monthly_spend_limit: In UZS per calendar month (UTC), from 0 to 999999999999.99 with at most two
                decimals. Leave it out, or pass None, for no limit.
            allowed_ips: Up to 100 addresses or CIDR ranges the key may be used from.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(
            name=name,
            access=access,
            description=description,
            permissions=permissions,
            expires_at=expires_at,
            monthly_spend_limit=monthly_spend_limit,
            allowed_ips=allowed_ips,
        )
        request = APIRequest("POST", "/api-keys", "once", body=body, options=options)
        return self._http.request(request, read_envelope(ApiKey))

    def retrieve(
        self,
        id: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ApiKey:
        """One key by id. A key of another organization raises NotFoundError."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/api-keys/{id}", "safe", path_params={"id": id}, options=options)
        return self._http.request(request, read_envelope(ApiKey))

    def update(
        self,
        id: str,
        *,
        name: str | NotGiven = NOT_GIVEN,
        description: str | NotGiven | None = NOT_GIVEN,
        access: ApiKeyAccess | NotGiven = NOT_GIVEN,
        permissions: ApiKeyPermissionsParam | NotGiven = NOT_GIVEN,
        expires_at: str | NotGiven | None = NOT_GIVEN,
        monthly_spend_limit: float | NotGiven | None = NOT_GIVEN,
        enabled: bool | NotGiven = NOT_GIVEN,
        allowed_ips: Sequence[str] | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ApiKey:
        """Changes a key. Only the fields you pass are sent.

        A change that gives the key more power is checked as if the key were being created, so send the key's limits
        along with it. A revoked key can't be changed: ConflictError (409 `conflict`).

        Args:
            name: From 1 to 80 characters.
            description: Up to 500 characters.
            access: `full` or `restricted`.
            permissions: Replaces the whole map. Levels by product, such as `{"tts": "write"}`.
            expires_at: When the key stops working (ISO 8601); None clears the expiry.
            monthly_spend_limit: In UZS per calendar month (UTC), from 0 to 999999999999.99 with at most two
                decimals. None removes the limit.
            enabled: Switches the key on or off.
            allowed_ips: Up to 100 addresses or CIDR ranges; None or [] clears the allowlist.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(
            name=name,
            description=description,
            access=access,
            permissions=permissions,
            expires_at=expires_at,
            monthly_spend_limit=monthly_spend_limit,
            enabled=enabled,
            allowed_ips=allowed_ips,
        )
        request = APIRequest("PATCH", "/api-keys/{id}", "safe", path_params={"id": id}, body=body, options=options)
        return self._http.request(request, read_envelope(ApiKey))

    def revoke(
        self,
        id: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        """Revokes a key for good: it stops working at once and can never be switched back on.

        A key may revoke itself, to rotate.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("POST", "/api-keys/{id}/revoke", "safe", path_params={"id": id}, options=options)
        self._http.request(request, read_nothing)


class ApiKeysWithRawResponse:
    """The API keys' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, api_keys: ApiKeys) -> None:
        self.list = to_raw(api_keys.list)
        self.create = to_raw(api_keys.create)
        self.retrieve = to_raw(api_keys.retrieve)
        self.update = to_raw(api_keys.update)
        self.revoke = to_raw(api_keys.revoke)
