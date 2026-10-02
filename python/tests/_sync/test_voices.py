# Written by scripts/unasync.py from tests/_async/test_voices.py. Edit that file, then run the script.
import base64
from pathlib import Path

import httpx
import pytest

from naiuz import NOT_GIVEN, NeuronAIError, NotFoundError, UnprocessableEntityError
from naiuz.types import CreateVoiceRequest, ReplaceVoiceAudioRequest, UpdateVoiceRequest, Voice
from tests.helpers import UUID_V4, MockAPI, api_error, body_of, envelope, form_of, json_response, no_content

from .clients import client_for, retry_classes

CLIP = b"RIFF\x24\x00\x00\x00WAVEfmt "


def clip(filename: str, content_type: str) -> dict[str, str]:
    """A file part as `form_of` gives it: the clip under `filename`, declared as `content_type`."""
    return {"filename": filename, "content_type": content_type, "base64": base64.b64encode(CLIP).decode()}


def voice(id: str) -> dict[str, object]:
    return {"id": id, "name": id, "language": "uz", "tags": [], "type": "custom", "category": None, "ref_text": None}


def page(ids: list[str], next_cursor: str | None) -> httpx.Response:
    return json_response(200, {"data": [voice(id) for id in ids], "next_cursor": next_cursor, "request_id": "req-page"})


def test_list_sends_no_query_when_given_none_and_the_query_it_is_given() -> None:
    api = MockAPI(page(["a"], None), page(["b"], None))
    client = client_for(api)
    client.voices.list()
    client.voices.list(type="stock", language="uz", limit=100, cursor="c1")
    assert api.requests[0].url.raw_path == b"/api/v1/tts/voices"
    assert api.requests[1].url.params.multi_items() == [
        ("type", "stock"),
        ("language", "uz"),
        ("limit", "100"),
        ("cursor", "c1"),
    ]


def test_list_walks_every_voice_across_pages() -> None:
    api = MockAPI(page(["a", "b"], "c2"), page(["c"], None))
    assert [item.id for item in client_for(api).voices.list(limit=2)] == ["a", "b", "c"]


def test_list_sends_a_limit_outside_1_to_100_as_given_and_raises_the_api_s_422() -> None:
    api = MockAPI(api_error(422, "invalid_request"))
    with pytest.raises(UnprocessableEntityError):
        client_for(api).voices.list(limit=0)
    assert api.requests[0].url.params["limit"] == "0"


def test_retrieve_reads_one_voice_with_its_request_id() -> None:
    api = MockAPI(envelope(voice("uz-sardor"), "req-voice"))
    found = client_for(api).voices.retrieve("uz-sardor")
    assert isinstance(found, Voice)
    assert (found.id, found.request_id) == ("uz-sardor", "req-voice")
    assert api.requests[0].url.raw_path == b"/api/v1/tts/voices/uz-sardor"


@pytest.mark.parametrize("id", ["", ".", ".."])
def test_retrieve_refuses_an_empty_or_dot_segment_id_without_sending_anything(id: str) -> None:
    api = MockAPI()
    with pytest.raises(NeuronAIError, match=r'^The path parameter "id" must be a non-empty string'):
        client_for(api).voices.retrieve(id)
    assert api.requests == []


def test_update_sends_only_the_fields_passed_with_none_as_null() -> None:
    api = MockAPI(envelope(voice("v1")), envelope(voice("v1")))
    client = client_for(api)
    client.voices.update("v1", name="Support voice", tags=None)
    client.voices.update("v1", ref_text="", category=NOT_GIVEN)
    assert (api.requests[0].method, api.requests[0].url.raw_path) == ("PATCH", b"/api/v1/tts/voices/v1")
    assert body_of(api.requests[0]) == {"name": "Support voice", "tags": None}
    assert body_of(api.requests[1]) == {"ref_text": ""}


def test_update_takes_an_update_voice_request_as_keyword_arguments() -> None:
    api = MockAPI(envelope(voice("v1")))
    change: UpdateVoiceRequest = {"name": "Support voice", "category": "conversational", "tags": ["support"]}
    client_for(api).voices.update("v1", **change)
    assert body_of(api.requests[0]) == {"name": "Support voice", "category": "conversational", "tags": ["support"]}


def test_delete_returns_none_for_a_204_and_sends_no_body() -> None:
    api = MockAPI(no_content({"x-request-id": "req-delete"}))
    client_for(api).voices.delete("v1")
    assert (api.requests[0].method, api.requests[0].content) == ("DELETE", b"")


def test_the_api_s_404_raises_not_found_error() -> None:
    with pytest.raises(NotFoundError):
        client_for(MockAPI(api_error(404, "not_found"))).voices.retrieve("no-such-voice")


def test_list_retrieve_and_delete_are_safe_calls_and_update_a_re_create(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(MockAPI(page([], None), envelope(voice("v1")), envelope(voice("v1")), no_content()))
    client.voices.list()
    client.voices.retrieve("v1")
    client.voices.update("v1", name="x")
    client.voices.delete("v1")
    assert seen == ["safe", "safe", "recreate", "safe"]


def test_with_raw_response_gives_a_list_s_first_page_and_a_delete_s_204() -> None:
    client = client_for(MockAPI(page(["a"], None), no_content()))
    listed = client.voices.with_raw_response.list()
    deleted = client.voices.with_raw_response.delete("v1")
    assert ([item.id for item in listed.data.data], listed.status) == (["a"], 200)
    assert (deleted.data, deleted.status) == (None, 204)


def test_a_voice_may_leave_out_category_ref_text_and_created_at_and_have_a_type_the_sdk_doesn_t_know() -> None:
    found = Voice.model_validate({"id": "v", "name": "V", "language": "uz", "tags": [], "type": "shared"})
    assert (found.category, found.ref_text, found.created_at, found.type) == (None, None, None, "shared")
    assert found.model_dump() == {"id": "v", "name": "V", "language": "uz", "tags": [], "type": "shared"}


def test_update_sends_every_field_it_is_given() -> None:
    api = MockAPI(envelope(voice("v1")))
    client_for(api).voices.update(
        "v1", name="Support voice", category="conversational", language="ru", ref_text=None, tags=["support"]
    )
    assert body_of(api.requests[0]) == {
        "name": "Support voice",
        "category": "conversational",
        "language": "ru",
        "ref_text": None,
        "tags": ["support"],
    }


def test_create_sends_the_clip_and_its_fields_as_multipart_the_tags_as_repeated_tags_with_a_key() -> None:
    api = MockAPI(envelope(voice("v-new"), "req-clone", 201))
    created = client_for(api).voices.create(
        name="Office voice",
        language="uz",
        ref_audio=("sample.wav", CLIP),
        ref_text="Salom",
        category="conversational",
        tags=["support", "calm"],
        idempotency_key="clone-1",
    )
    assert (created.id, created.request_id) == ("v-new", "req-clone")
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("POST", b"/api/v1/tts/voices")
    assert sent.headers["idempotency-key"] == "clone-1"
    assert sent.headers["content-type"].startswith("multipart/form-data; boundary=")
    assert form_of(sent) == {
        "fields": {
            "name": "Office voice",
            "language": "uz",
            "ref_text": "Salom",
            "category": "conversational",
            "tags": ["support", "calm"],
        },
        "files": {"ref_audio": clip("sample.wav", "audio/wav")},
    }


def test_create_takes_a_create_voice_request_with_a_path_as_keyword_arguments(tmp_path: Path) -> None:
    path = tmp_path / "sample.flac"
    path.write_bytes(CLIP)
    api = MockAPI(envelope(voice("v-new"), status=201))
    request: CreateVoiceRequest = {"name": "V", "language": "uz", "ref_audio": path, "ref_text": None, "tags": []}
    client_for(api).voices.create(**request)
    assert form_of(api.requests[0]) == {
        "fields": {"name": "V", "language": "uz"},
        "files": {"ref_audio": clip("sample.flac", "audio/flac")},
    }
    assert UUID_V4.fullmatch(api.requests[0].headers["idempotency-key"])


def test_create_returns_the_voice_for_a_200_replay_of_its_key_as_for_a_201() -> None:
    replay = json_response(200, {"data": voice("v-new"), "request_id": "r"}, {"idempotency-replayed": "1"})
    raw = client_for(MockAPI(replay)).voices.with_raw_response.create(
        name="Office voice", language="uz", ref_audio=("sample.wav", CLIP), idempotency_key="clone-1"
    )
    assert (raw.data.id, raw.status, raw.headers["idempotency-replayed"]) == ("v-new", 200, "1")


def test_create_refuses_bytes_without_a_filename_sending_nothing() -> None:
    api = MockAPI()
    with pytest.raises(NeuronAIError, match=r'^ref_audio needs a filename: pass \("clip\.wav", data\)'):
        client_for(api).voices.create(
            name="V",
            language="uz",
            ref_audio=CLIP,  # type: ignore[arg-type]  # pyright: ignore[reportArgumentType]
        )
    assert api.requests == []


def test_replace_audio_sends_the_new_clip_and_its_transcript_as_multipart_with_no_key() -> None:
    api = MockAPI(envelope(voice("v1"), "req-replace"), envelope(voice("v1")))
    client = client_for(api)
    replaced = client.voices.replace_audio("v1", ref_audio=("new.mp3", CLIP), ref_text="Yangi")
    change: ReplaceVoiceAudioRequest = {"ref_audio": ("new.m4a", CLIP, "audio/x-m4a"), "ref_text": None}
    client.voices.replace_audio("v1", **change)
    assert replaced.request_id == "req-replace"
    first, second = api.requests
    assert (first.method, first.url.raw_path) == ("POST", b"/api/v1/tts/voices/v1/audio")
    assert "idempotency-key" not in first.headers
    assert form_of(first) == {"fields": {"ref_text": "Yangi"}, "files": {"ref_audio": clip("new.mp3", "audio/mpeg")}}
    assert form_of(second) == {"fields": {}, "files": {"ref_audio": clip("new.m4a", "audio/x-m4a")}}


def test_create_is_an_idempotent_call_and_replace_audio_a_re_create(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(MockAPI(envelope(voice("v1"), status=201), envelope(voice("v1"))))
    client.voices.create(name="V", language="uz", ref_audio=("a.wav", CLIP))
    client.voices.replace_audio("v1", ref_audio=("a.wav", CLIP))
    assert seen == ["idempotent", "recreate"]
