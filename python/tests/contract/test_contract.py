import json
from typing import Any

import httpx
import pytest

from naiuz import NeuronAI
from naiuz._errors import make_api_error
from naiuz._models import WithRequestId
from naiuz._uploads import Form, encode_form
from naiuz.types import SpeechAudio

from .harness import (
    FIXTURE_KEY,
    KINDS,
    OPERATIONS,
    Kind,
    client_of,
    comparable,
    expect_request,
    list_fixtures,
    load_fixture,
    project_error,
    project_result,
    project_stream,
    replay,
    resolve_method,
    without_unknown_fields,
)

FIXTURES = list_fixtures()
ERRORS = [file for file in FIXTURES if load_fixture(file)["response"]["status"] >= 400]
PYTHON_PATHS = [entry["python"] for entry in [*OPERATIONS["operations"].values(), *OPERATIONS["helpers"].values()]]


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("file", FIXTURES)
async def test_a_fixture_sends_its_request_and_returns_its_result(file: str, kind: Kind) -> None:
    fixture = load_fixture(file)
    replayed = await replay(fixture, kind)
    expect_request(replayed.requests, fixture["request"])
    assert comparable(without_unknown_fields(replayed.result, fixture)) == comparable(fixture["result"])


@pytest.mark.parametrize("file", ERRORS)
def test_an_error_fixture_s_answer_maps_to_its_error_deferred_or_not(file: str) -> None:
    response = load_fixture(file)["response"]
    body = json.dumps(response["body"]["json"]) if response["body"] is not None else ""
    error = make_api_error(response["status"], "", httpx.Headers(response["headers"]), body)
    assert comparable(project_error(error)) == comparable(load_fixture(file)["result"])


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("path", PYTHON_PATHS)
def test_every_method_exists(path: str, kind: Kind) -> None:
    method = resolve_method(client_of(kind, httpx.MockTransport(lambda request: httpx.Response(500))), path)
    assert method is not None, f"client.{path} is missing"


def test_a_fixture_replays_for_every_operation() -> None:
    replayed = {file.split("/")[0] for file in FIXTURES}
    for operation_id in OPERATIONS["operations"]:
        assert operation_id in replayed, operation_id


def sent(target: str) -> httpx.Request:
    return httpx.Request("GET", f"https://my.neuronai.uz{target}", headers={"authorization": f"Bearer {FIXTURE_KEY}"})


EXPECTED: dict[str, Any] = {
    "method": "GET",
    "path": "/tts/voices/O%27zbek",
    "query": {"limit": "3"},
    "headers": {"authorization": f"Bearer {FIXTURE_KEY}"},
    "body": None,
}


def test_expect_request_passes_the_request_the_fixture_describes() -> None:
    expect_request([sent("/api/v1/tts/voices/O%27zbek?limit=3")], EXPECTED)


def test_expect_request_fails_when_a_query_key_is_sent_twice() -> None:
    with pytest.raises(AssertionError):
        expect_request([sent("/api/v1/tts/voices/O%27zbek?limit=2&limit=3")], EXPECTED)


def test_expect_request_fails_when_the_call_sends_more_than_one_request() -> None:
    request = sent("/api/v1/tts/voices/O%27zbek?limit=3")
    with pytest.raises(AssertionError, match="exactly one request"):
        expect_request([request, request], EXPECTED)


def test_expect_request_compares_the_raw_target_so_a_path_encoded_otherwise_fails() -> None:
    with pytest.raises(AssertionError):
        expect_request([sent("/api/v1/tts/voices/O'zbek?limit=3")], EXPECTED)


def test_unknown_fields_on_a_compatible_result_leave_the_body_and_never_the_cost() -> None:
    fixture: dict[str, Any] = {"operationId": "createChatCompletion", "unknown_fields": ["/cost", "/beta"]}
    result = {"body": {"id": "chatcmpl-x", "cost": 111, "beta": True}, "cost": 999}
    assert without_unknown_fields(result, fixture) == {"body": {"id": "chatcmpl-x"}, "cost": 999}


def test_project_result_decides_the_shape_from_the_operation_not_from_the_value() -> None:
    empty = httpx.Response(200, json={"data": [], "next_cursor": None, "request_id": "r"})
    client = NeuronAI(api_key=FIXTURE_KEY, http_client=httpx.Client(transport=httpx.MockTransport(lambda _: empty)))
    with pytest.raises(AssertionError, match="retrieveApiKey"):
        project_result("retrieveApiKey", client.api_keys.list())
    with pytest.raises(AssertionError, match="listApiKeys"):
        project_result("listApiKeys", WithRequestId())


def test_project_result_wants_audio_from_an_audio_operation_and_from_no_other() -> None:
    audio = SpeechAudio(b"RIFF", "audio/wav", None, None, None, False, None, False, None)
    with pytest.raises(AssertionError, match="synthesizeSpeech should return audio"):
        project_result("synthesizeSpeech", WithRequestId())
    with pytest.raises(AssertionError, match="retrieveVoice should not return audio"):
        project_result("retrieveVoice", audio)
    with pytest.raises(AssertionError, match="synthesizeDialogue should return a DialogueAudio"):
        project_result("synthesizeDialogue", audio)


async def test_project_stream_wants_a_stream() -> None:
    with pytest.raises(AssertionError, match="A call with stream=True should return a stream, not WithRequestId"):
        await project_stream(WithRequestId())


def test_comparable_drops_nulls_and_tells_a_boolean_from_a_number() -> None:
    with_nulls: dict[str, object] = {"a": None, "b": [1, {"c": None}]}
    without: dict[str, object] = {"b": [1.0, {}]}
    assert comparable(with_nulls) == comparable(without)
    assert comparable({"enabled": True}) != comparable({"enabled": 1})


BODY_EXPECTED: dict[str, Any] = {
    "method": "PATCH",
    "path": "/api-keys/key_1",
    "headers": {"authorization": f"Bearer {FIXTURE_KEY}"},
    "body": {"json": {"name": "Ops", "limit": 1, "enabled": True}},
}


def patched(body: dict[str, object]) -> httpx.Request:
    return httpx.Request(
        "PATCH",
        "https://my.neuronai.uz/api/v1/api-keys/key_1",
        headers={"authorization": f"Bearer {FIXTURE_KEY}"},
        json=body,
    )


def test_expect_request_passes_a_body_that_differs_only_in_key_order_or_how_a_number_is_written() -> None:
    expect_request([patched({"enabled": True, "limit": 1.0, "name": "Ops"})], BODY_EXPECTED)


@pytest.mark.parametrize(
    ("body", "expected_body"),
    [
        ({"name": "Ops", "expires_at": None}, {"name": "Ops"}),
        ({"name": "Ops"}, {"name": "Ops", "expires_at": None}),
        ({"name": "Ops", "enabled": 1}, {"name": "Ops", "enabled": True}),
    ],
    ids=["a null the fixture doesn't hold", "a null the fixture holds, left out", "a number for a boolean"],
)
def test_expect_request_compares_the_body_exactly_null_for_null(
    body: dict[str, object], expected_body: dict[str, object]
) -> None:
    """A null in a request body is an instruction, such as clearing a key's expiry, so it never matches absence."""
    with pytest.raises(AssertionError):
        expect_request([patched(body)], {**BODY_EXPECTED, "body": {"json": expected_body}})


UPLOAD_EXPECTED: dict[str, Any] = {
    "method": "POST",
    "path": "/stt/transcribe",
    "headers": {"authorization": f"Bearer {FIXTURE_KEY}", "content-type": "multipart/form-data"},
    "body": {
        "multipart": {
            "fields": {"language": "uz", "tags": ["a", "b"]},
            "files": {"file": {"filename": "clip.wav", "content_type": "audio/wav", "base64": "UklGRg=="}},
        }
    },
}


def uploaded(fields: dict[str, object]) -> httpx.Request:
    body, content_type = encode_form(Form(fields, ("file",)))
    return posted(body, content_type)


def posted(body: bytes, content_type: str) -> httpx.Request:
    url = "https://my.neuronai.uz/api/v1/stt/transcribe"
    headers = {"authorization": f"Bearer {FIXTURE_KEY}", "content-type": content_type}
    return httpx.Request("POST", url, headers=headers, content=body)


def test_expect_request_passes_the_form_the_fixture_describes() -> None:
    expect_request([uploaded({"language": "uz", "tags": ["a", "b"], "file": ("clip.wav", b"RIFF")})], UPLOAD_EXPECTED)


@pytest.mark.parametrize(
    "request_",
    [
        uploaded({"language": "uz", "tags": ["a", "b"], "file": ("clip.wav", b"RIFF"), "extra": "x"}),
        uploaded({"language": "uz", "tags": ["a"], "file": ("clip.wav", b"RIFF")}),
        uploaded({"language": "uz", "tags": "a", "file": ("clip.wav", b"RIFF")}),
        uploaded({"language": "uz", "tags": ["a", "b"], "file": ("clip.wav", b"RIFF", "audio/x-wav")}),
        uploaded({"language": "uz", "tags": ["a", "b"], "file": ("take.wav", b"RIFF")}),
        uploaded({"language": "uz", "tags": ["a", "b"], "file": ("clip.wav", b"RIFX")}),
        posted(
            b'--b\r\nContent-Disposition: form-data; name="language"\r\n\r\nuz\r\n' * 2 + b"--b--\r\n",
            "multipart/form-data; boundary=b",
        ),
        posted(b'{"language": "uz"}', "application/json"),
    ],
    ids=[
        "a field more",
        "a list item fewer",
        "a list sent as one field",
        "another content type",
        "another filename",
        "other bytes",
        "a field sent twice",
        "JSON for a form",
    ],
)
def test_expect_request_compares_a_form_exactly(request_: httpx.Request) -> None:
    with pytest.raises(AssertionError):
        expect_request([request_], UPLOAD_EXPECTED)
