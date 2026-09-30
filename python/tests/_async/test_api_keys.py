import pytest

from naiuz import InternalServerError
from naiuz.types import ApiKey, CreateApiKeyRequest, UpdateApiKeyRequest
from tests.helpers import MockAPI, api_error, body_of, envelope, json_response, no_content

from .clients import client_for, retry_classes

KEY_ID = "01j9zqa1b2c3d4e5f6g7h8j9k0"

PERMISSIONS = {
    "tts": "write",
    "voices": "read",
    "stt": "none",
    "llm": "none",
    "embeddings": "none",
    "rerank": "none",
    "account": "read",
    "api_keys": "none",
}


def key(**fields: object) -> dict[str, object]:
    return {
        "id": KEY_ID,
        "name": "Production",
        "description": None,
        "masked_key": "nai_****k0Zx",
        "access": "restricted",
        "permissions": PERMISSIONS,
        "expires_at": None,
        "allowed_ips": [],
        "monthly_spend_limit": None,
        "spent_this_month": 0,
        "enabled": True,
        "revoked_at": None,
        "last_used_at": None,
        "created_at": "2026-09-01T12:00:00Z",
        **fields,
    }


async def test_list_pages_through_the_keys() -> None:
    api = MockAPI(
        json_response(200, {"data": [key()], "next_cursor": "c2", "request_id": "r1"}),
        json_response(200, {"data": [key(id="k2")], "next_cursor": None, "request_id": "r2"}),
    )
    assert [item.id async for item in client_for(api).api_keys.list(limit=1)] == [KEY_ID, "k2"]
    assert [request.url.raw_path for request in api.requests] == [
        b"/api/v1/api-keys?limit=1",
        b"/api/v1/api-keys?limit=1&cursor=c2",
    ]


async def test_create_posts_the_key_and_returns_it_with_its_secret() -> None:
    api = MockAPI(envelope(key(secret="nai_shown_once"), "req-create", 201))
    created = await client_for(api).api_keys.create(name="CI", access="restricted", permissions={"tts": "write"})
    assert isinstance(created, ApiKey)
    assert (created.secret, created.request_id) == ("nai_shown_once", "req-create")
    assert (api.requests[0].method, api.requests[0].url.raw_path) == ("POST", b"/api/v1/api-keys")
    assert body_of(api.requests[0]) == {"name": "CI", "access": "restricted", "permissions": {"tts": "write"}}
    assert "idempotency-key" not in api.requests[0].headers


async def test_create_takes_a_create_api_key_request_as_keyword_arguments() -> None:
    api = MockAPI(envelope(key(), status=201))
    new_key: CreateApiKeyRequest = {"name": "CI", "access": "full", "monthly_spend_limit": 5000, "allowed_ips": []}
    await client_for(api).api_keys.create(**new_key)
    assert body_of(api.requests[0]) == {"name": "CI", "access": "full", "monthly_spend_limit": 5000, "allowed_ips": []}


async def test_retrieve_and_update_address_the_key_by_id_and_update_sends_only_what_is_passed() -> None:
    api = MockAPI(envelope(key()), envelope(key(enabled=False)))
    client = client_for(api)
    await client.api_keys.retrieve(KEY_ID)
    updated = await client.api_keys.update(KEY_ID, enabled=False, monthly_spend_limit=None)
    assert updated.enabled is False
    assert [(request.method, request.url.raw_path) for request in api.requests] == [
        ("GET", f"/api/v1/api-keys/{KEY_ID}".encode()),
        ("PATCH", f"/api/v1/api-keys/{KEY_ID}".encode()),
    ]
    assert body_of(api.requests[1]) == {"enabled": False, "monthly_spend_limit": None}


async def test_update_takes_an_update_api_key_request_as_keyword_arguments() -> None:
    api = MockAPI(envelope(key()))
    change: UpdateApiKeyRequest = {"name": "Renamed", "expires_at": None, "permissions": {"api_keys": "read"}}
    await client_for(api).api_keys.update(KEY_ID, **change)
    assert body_of(api.requests[0]) == {"name": "Renamed", "expires_at": None, "permissions": {"api_keys": "read"}}


async def test_revoke_posts_without_a_body_and_returns_none() -> None:
    api = MockAPI(no_content())
    await client_for(api).api_keys.revoke(KEY_ID)
    assert (api.requests[0].method, api.requests[0].url.raw_path) == (
        "POST",
        f"/api/v1/api-keys/{KEY_ID}/revoke".encode(),
    )
    assert api.requests[0].content == b""
    assert "content-type" not in api.requests[0].headers


async def test_create_is_never_retried_after_a_5xx_which_could_make_a_second_key() -> None:
    api = MockAPI(api_error(503, "service_unavailable", {"retry-after": "0"}), envelope(key()))
    with pytest.raises(InternalServerError):
        await client_for(api, max_retries=2).api_keys.create(name="CI", access="full")
    assert len(api.requests) == 1


async def test_create_is_retried_as_once_and_the_rest_as_safe_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = retry_classes(monkeypatch)
    page = json_response(200, {"data": [], "next_cursor": None, "request_id": "r"})
    client = client_for(MockAPI(page, envelope(key()), envelope(key()), envelope(key()), no_content()))
    await client.api_keys.list()
    await client.api_keys.create(name="CI", access="full")
    await client.api_keys.retrieve(KEY_ID)
    await client.api_keys.update(KEY_ID, name="Renamed")
    await client.api_keys.revoke(KEY_ID)
    assert seen == ["safe", "once", "safe", "safe", "safe"]


def test_a_key_without_its_secret_dumps_without_it_and_takes_a_level_the_sdk_doesn_t_know() -> None:
    found = ApiKey.model_validate(key(permissions={**PERMISSIONS, "tts": "admin"}))
    assert found.secret is None
    assert "secret" not in found.model_dump()
    assert found.permissions.tts == "admin"
