"""Your organization's API keys."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, TypedDict

from .._models import BaseModel, WithRequestId

ApiKeyAccess = Literal["full", "restricted"]
"""How much a key may do.

A `full` key holds every product at its highest level, products added later included, but never `api_keys`, which is
only ever granted explicitly. A `restricted` key holds exactly the levels in its `permissions` map.
"""


class ApiKeyPermissions(BaseModel):
    """A key's level for every product."""

    tts: Literal["none", "read", "write"] | str
    voices: Literal["none", "read", "write"] | str
    stt: Literal["none", "write"] | str
    llm: Literal["none", "read", "write"] | str
    embeddings: Literal["none", "write"] | str
    rerank: Literal["none", "write"] | str
    account: Literal["none", "read"] | str
    api_keys: Literal["none", "read", "write"] | str


class ApiKeyPermissionsParam(TypedDict, total=False):
    """Levels by product, such as `{"tts": "write"}`.

    On a `restricted` key a product left out is `none`. A `full` key already holds every other product at its highest
    level, so its map may name only `api_keys`.
    """

    tts: Literal["none", "read", "write"]
    voices: Literal["none", "read", "write"]
    stt: Literal["none", "write"]
    llm: Literal["none", "read", "write"]
    embeddings: Literal["none", "write"]
    rerank: Literal["none", "write"]
    account: Literal["none", "read"]
    api_keys: Literal["none", "read", "write"]


class ApiKey(WithRequestId):
    """An API key. Its secret is only ever shown once, in the result of `api_keys.create`."""

    id: str
    """A lowercase ULID."""
    name: str
    """The key's name."""
    description: str | None
    """The key's description, or None."""
    masked_key: str
    """`nai_...` and the last four characters of the secret."""
    access: ApiKeyAccess | str
    """`full` or `restricted`."""
    permissions: ApiKeyPermissions
    """The effective level for every product. A full key reads as what it can do; `api_keys` is only ever granted
    explicitly."""
    expires_at: str | None
    """When the key stops working, or None for never."""
    allowed_ips: list[str]
    """Addresses or CIDR ranges the key may be used from. Empty allows any address."""
    monthly_spend_limit: float | None
    """UZS per calendar month (UTC), or None for no limit."""
    spent_this_month: float
    """UZS spent this calendar month (UTC)."""
    enabled: bool
    """Whether the key works; a disabled key can be enabled again."""
    revoked_at: str | None
    """When the key was revoked, or None. A revoked key never works again."""
    last_used_at: str | None
    """When the key was last used, or None."""
    created_at: str
    """When the key was created (ISO 8601)."""
    secret: str | None = None
    """The whole key. Only in the result of a create, and never again."""


class _CreateApiKeyFields(TypedDict):
    name: str
    """From 1 to 80 characters."""
    access: ApiKeyAccess
    """`full` or `restricted`."""


class CreateApiKeyRequest(_CreateApiKeyFields, total=False):
    """The key `api_keys.create` makes. `name` and `access` are required, so every key states what it may do."""

    description: str | None
    """Up to 500 characters."""
    permissions: ApiKeyPermissionsParam
    """Levels by product, such as `{"tts": "write"}`."""
    expires_at: str | None
    """When the key stops working (ISO 8601), or None for never."""
    monthly_spend_limit: float | None
    """In UZS per calendar month (UTC), from 0 to 999999999999.99 with at most two decimals. None for no limit."""
    allowed_ips: Sequence[str] | None
    """Up to 100 addresses or CIDR ranges the key may be used from."""


class UpdateApiKeyRequest(TypedDict, total=False):
    """The fields `api_keys.update` changes, each optional: one left out stays as it is."""

    name: str
    """From 1 to 80 characters."""
    description: str | None
    """Up to 500 characters."""
    access: ApiKeyAccess
    """`full` or `restricted`."""
    permissions: ApiKeyPermissionsParam
    """Replaces the whole map. Levels by product, such as `{"tts": "write"}`."""
    expires_at: str | None
    """When the key stops working (ISO 8601); None clears the expiry."""
    monthly_spend_limit: float | None
    """In UZS per calendar month (UTC), from 0 to 999999999999.99 with at most two decimals. None removes the
    limit."""
    enabled: bool
    """Switches the key on or off."""
    allowed_ips: Sequence[str] | None
    """Up to 100 addresses or CIDR ranges; None or [] clears the allowlist."""
