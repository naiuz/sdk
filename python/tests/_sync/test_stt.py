# Written by scripts/unasync.py from tests/_async/test_stt.py. Edit that file, then run the script.
import base64
import io

import pytest

from naiuz.types import CreateTranscriptionRequest, Transcription
from tests.helpers import UUID_V4, MockAPI, envelope, form_of

from .clients import client_for, retry_classes

CLIP = b"RIFF\x24\x00\x00\x00WAVEfmt "
TRANSCRIPTION = {
    "text": "Salom dunyo",
    "language": "uz",
    "duration_seconds": 2,
    "segments": [{"start": 0, "end": 2, "text": "Salom dunyo"}],
    "cost": 16.67,
    "balance": 9983.33,
}


def clip(filename: str, content_type: str) -> dict[str, str]:
    """A file part as `form_of` gives it: the clip under `filename`, declared as `content_type`."""
    return {"filename": filename, "content_type": content_type, "base64": base64.b64encode(CLIP).decode()}


def test_transcribe_sends_the_file_and_the_language_as_multipart_with_a_key_and_returns_the_text() -> None:
    api = MockAPI(envelope(TRANSCRIPTION, "req-stt"))
    result = client_for(api).stt.transcribe(file=("call.m4a", CLIP), language="uz", idempotency_key="stt-1")
    assert isinstance(result, Transcription)
    assert (result.text, result.duration_seconds, result.segments[0].end) == ("Salom dunyo", 2, 2)
    assert (result.cost, result.balance, result.request_id) == (16.67, 9983.33, "req-stt")
    assert result.model_dump() == TRANSCRIPTION
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("POST", b"/api/v1/stt/transcribe")
    assert sent.headers["idempotency-key"] == "stt-1"
    assert form_of(sent) == {"fields": {"language": "uz"}, "files": {"file": clip("call.m4a", "audio/mp4")}}


def test_transcribe_takes_a_create_transcription_request_with_a_named_file_object() -> None:
    api = MockAPI(envelope(TRANSCRIPTION))
    recording = io.BytesIO(CLIP)
    recording.name = "recordings/call.ogg"
    request: CreateTranscriptionRequest = {"file": recording, "language": "ru"}
    client_for(api).stt.transcribe(**request)
    assert form_of(api.requests[0]) == {"fields": {"language": "ru"}, "files": {"file": clip("call.ogg", "audio/ogg")}}
    assert UUID_V4.fullmatch(api.requests[0].headers["idempotency-key"])


def test_transcribe_is_an_idempotent_call_with_a_raw_response(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = retry_classes(monkeypatch)
    raw = client_for(MockAPI(envelope(TRANSCRIPTION, "req-stt"))).stt.with_raw_response.transcribe(
        file=("call.wav", CLIP), language="uz"
    )
    assert (raw.data.text, raw.status, raw.headers["x-request-id"]) == ("Salom dunyo", 200, "req-stt")
    assert seen == ["idempotent"]
