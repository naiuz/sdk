# Written by scripts/unasync.py from tests/_async/test_agents.py. Edit that file, then run the script.
import httpx

from tests.helpers import MockAPI, envelope

from .clients import client_for

SIGNED_URL = {"signed_url": "wss://example.test/session", "expires_at": "2026-11-04T10:15:00Z"}


def _reply() -> httpx.Response:
    return envelope(SIGNED_URL)


def test_signed_url_sends_each_variable_as_its_own_vars_name_beside_the_customer() -> None:
    api = MockAPI(_reply())
    client_for(api).agents.signed_url(
        "agent_1", customer_id="crm-42", vars={"plan": "gold", "seats": 3, "trial": True}
    )
    url = api.requests[0].url
    assert url.path.endswith("/agents/agent_1/signed-url")
    assert dict(url.params) == {
        "customer_id": "crm-42",
        "vars[plan]": "gold",
        "vars[seats]": "3",
        "vars[trial]": "true",
    }


def test_signed_url_sends_no_query_when_given_none() -> None:
    api = MockAPI(_reply())
    client_for(api).agents.signed_url("agent_1")
    assert api.requests[0].url.query == b""
