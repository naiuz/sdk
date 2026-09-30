"""Replays spec/fixtures through the real clients, as spec/fixtures/README.md says."""

from __future__ import annotations

import inspect
import json
from dataclasses import dataclass
from typing import Any, Literal, cast

import httpx

from naiuz import APIError, AsyncNeuronAI, AsyncPage, BaseModel, NeuronAI, Page, RateLimitError
from naiuz._models import WithCost, WithRequestId
from tests.spec import SPEC_DIR, read_spec

FIXTURE_KEY = "nai_test_fixture_key"
"""The key every fixture's client is built with."""

OPERATIONS: dict[str, Any] = read_spec("operations.json")
"""spec/operations.json: every operation's HTTP route and SDK method."""

Kind = Literal["sync", "async"]
KINDS: list[Kind] = ["sync", "async"]

COMPATIBLE_OPERATIONS = {"createChatCompletion", "listModels", "createEmbedding", "rerank"}
PAGE_OPERATIONS = {"listVoices", "listApiKeys"}

DEFERRED_FIXTURES = [
    "createChatCompletion/stream-error.json",
    "createChatCompletion/streamed.json",
    "createTranscription/uzbek.json",
    "createVoice/created.json",
    "downloadTtsJobAudio/wav.json",
    "replaceVoiceAudio/replaced.json",
    "synthesizeDialogue/two-turns.json",
    "synthesizeSpeech/insufficient-balance.json",
    "synthesizeSpeech/rate-limited.json",
    "synthesizeSpeech/stock-voice.json",
    "synthesizeSpeech/unauthenticated.json",
    "synthesizeSpeech/validation-error.json",
]
"""Fixtures this version of the SDK can't replay yet: speech audio, uploads and streamed chat come in a later version.
When one starts to replay, a test fails until it leaves this list."""

DEFERRED_METHODS = [
    "tts.synthesize",
    "tts.dialogue",
    "tts.jobs.audio",
    "tts.jobs.create_and_wait",
    "voices.create",
    "voices.replace_audio",
    "stt.transcribe",
]
"""Methods from spec/operations.json that the clients don't have yet. When one appears, a test fails until it leaves
this list."""


def list_fixtures() -> list[str]:
    """Every fixture file under spec/fixtures, as `<operationId>/<name>.json`, sorted."""
    root = SPEC_DIR / "fixtures"
    return sorted(path.relative_to(root).as_posix() for path in root.glob("*/*.json"))


def load_fixture(file: str) -> dict[str, Any]:
    """One fixture, parsed."""
    fixture: dict[str, Any] = read_spec(f"fixtures/{file}")
    return fixture


def python_path(operation_id: str) -> str:
    """The Python method an operation maps to, such as `tts.jobs.create`."""
    path: str = OPERATIONS["operations"][operation_id]["python"]
    return path


def client_of(kind: Kind, transport: httpx.MockTransport) -> NeuronAI | AsyncNeuronAI:
    """A client as the README says: the fixture key, the default base URL and no retries."""
    if kind == "sync":
        return NeuronAI(api_key=FIXTURE_KEY, max_retries=0, http_client=httpx.Client(transport=transport))
    return AsyncNeuronAI(api_key=FIXTURE_KEY, max_retries=0, http_client=httpx.AsyncClient(transport=transport))


def resolve_method(client: object, path: str) -> Any:
    """The method a path such as `tts.jobs.create` names on the client; None when the client has no such method."""
    target: object = client
    for name in path.split("."):
        target = getattr(target, name, None)
    return target if callable(target) else None


def arguments_for(fixture: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    """A fixture's call as the method's arguments: the path parameters in path order, then the params and options."""
    route: str = OPERATIONS["operations"][fixture["operationId"]]["http"]
    call: dict[str, Any] = fixture["call"]
    names = [part[1:-1] for part in route.split("/") if part.startswith("{")]
    keywords: dict[str, Any] = dict(call.get("params", {}))
    if "idempotency_key" in call.get("options", {}):
        keywords["idempotency_key"] = call["options"]["idempotency_key"]
    return [call["path_params"][name] for name in names], keywords


def response_for(fixture: dict[str, Any]) -> httpx.Response:
    """The fixture's canned answer."""
    response: dict[str, Any] = fixture["response"]
    body: dict[str, Any] | None = response["body"]
    content = b"" if body is None else json.dumps(body["json"]).encode()
    return httpx.Response(response["status"], headers=response["headers"], content=content)


def project_error(error: APIError) -> dict[str, Any]:
    """An error in the README's `{error: {...}}` shape."""
    return {
        "error": {
            "class": type(error).__name__,
            "status": error.status,
            "type": error.type,
            "code": error.code,
            "message": error.message,
            "param": error.param,
            "fields": error.fields,
            "request_id": error.request_id,
            "retry_after": error.retry_after if isinstance(error, RateLimitError) else None,
        }
    }


def project_result(operation_id: str, value: object) -> object:
    """What the SDK returned, in the README's `result` shape as the operation decides it: a page, a compatible
    endpoint's `{body, cost}`, any other object's `{data, request_id}`, or null for nothing. A value of another shape
    raises."""
    if value is None:
        return None
    if operation_id in PAGE_OPERATIONS:
        if not isinstance(value, Page | AsyncPage):
            raise AssertionError(f"{operation_id} should return a page, but returned {type(value).__name__}.")
        page = cast("Page[BaseModel]", value)
        items = [item.model_dump() for item in page.data]
        return {"data": items, "next_cursor": page.next_cursor, "request_id": page.request_id}
    if operation_id in COMPATIBLE_OPERATIONS:
        if not isinstance(value, WithCost):
            raise AssertionError(
                f"{operation_id} should return a compatible body, but returned {type(value).__name__}."
            )
        return {"body": value.model_dump(), "cost": value.cost}
    if not isinstance(value, WithRequestId):
        raise AssertionError(f"{operation_id} should return an object with its request ID, not {type(value).__name__}.")
    return {"data": value.model_dump(), "request_id": value.request_id}


@dataclass
class Replayed:
    """What replaying a fixture gave: every request sent, and the result in the README's shape."""

    requests: list[httpx.Request]
    result: object


async def replay(fixture: dict[str, Any], kind: Kind) -> Replayed:
    """Replays a fixture through a client of `kind`, whose transport answers each request with the fixture's
    response. Raises LookupError when the client has no method for the operation."""
    requests: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return response_for(fixture)

    client = client_of(kind, httpx.MockTransport(answer))
    path = python_path(fixture["operationId"])
    method = resolve_method(client, path)
    if method is None:
        raise LookupError(f"client.{path} is not on the client")
    args, keywords = arguments_for(fixture)
    try:
        value = method(*args, **keywords)
        if inspect.isawaitable(value):
            value = await value
        result = project_result(fixture["operationId"], value)
    except APIError as error:
        result = project_error(error)
    return Replayed(requests, result)


def _member(value: object, name: str) -> object:
    """An object's member, or None when `value` isn't an object."""
    return cast("dict[str, object]", value).get(name) if isinstance(value, dict) else None


def without_unknown_fields(result: object, fixture: dict[str, Any]) -> object:
    """The result without the fields `unknown_fields` names, taken from the part that mirrors the response body:
    `body` for a compatible operation, whose `cost` comes from a header; the whole result otherwise."""
    copy: object = json.loads(json.dumps(result))
    root = _member(copy, "body") if fixture["operationId"] in COMPATIBLE_OPERATIONS else copy
    for pointer in fixture.get("unknown_fields", []):
        segments = [segment.replace("~1", "/").replace("~0", "~") for segment in pointer[1:].split("/")]
        parent = root
        for segment in segments[:-1]:
            parent = _member(parent, segment)
        if isinstance(parent, dict):
            cast("dict[str, object]", parent).pop(segments[-1], None)
    return copy


def comparable(value: object) -> object:
    """A JSON value ready to compare under the README's rules: a key holding null is dropped, so it matches one that
    is absent; key order doesn't matter, and numbers compare by value, but a boolean never equals a number."""
    if isinstance(value, bool):
        return ("bool", value)
    if isinstance(value, list):
        return [comparable(item) for item in cast("list[object]", value)]
    if isinstance(value, dict):
        return {key: comparable(item) for key, item in cast("dict[str, object]", value).items() if item is not None}
    return value


def exact(value: object) -> object:
    """A JSON value ready to compare exactly, as a request body is: key order doesn't matter and numbers compare by
    value, but a boolean never equals a number, and a key holding null never matches one that is absent, since a null
    in a request is an instruction, such as clearing a key's expiry."""
    if isinstance(value, bool):
        return ("bool", value)
    if isinstance(value, list):
        return [exact(item) for item in cast("list[object]", value)]
    if isinstance(value, dict):
        return {key: exact(item) for key, item in cast("dict[str, object]", value).items()}
    return value


def expect_request(requests: list[httpx.Request], expected: dict[str, Any]) -> None:
    """Asserts that exactly one request went out, and that it is the fixture's: the method, the raw request target
    as sent, the query with every key once, every fixture header with its value, and the body, null for null."""
    assert len(requests) == 1, f"the call sends exactly one request, not {len(requests)}"
    [sent] = requests
    assert sent.method == expected["method"]
    assert (sent.url.scheme, sent.url.host) == ("https", "my.neuronai.uz")
    # The raw target, as sent: a URL parser could re-encode the path, which is what the fixture pins.
    assert sent.url.raw_path.decode("ascii").partition("?")[0] == "/api/v1" + expected["path"]
    # Every pair, sorted, so a key sent twice can't pass for one sent once.
    assert sorted(sent.url.params.multi_items()) == sorted(expected.get("query", {}).items())
    for name, value in expected["headers"].items():
        assert sent.headers.get(name) == value, name
    if expected["body"] is None:
        assert sent.content == b""
    else:
        assert exact(json.loads(sent.content)) == exact(expected["body"]["json"])
