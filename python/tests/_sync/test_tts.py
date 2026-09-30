# Written by scripts/unasync.py from tests/_async/test_tts.py. Edit that file, then run the script.
import pytest

from naiuz.types import SynthesizeSpeechRequest, TtsJob
from tests.helpers import UUID_V4, MockAPI, body_of, envelope, json_response

from .clients import client_for, retry_classes


def job(status: str, **fields: object) -> dict[str, object]:
    return {
        "id": "job-1",
        "status": status,
        "created_at": "2026-09-28T10:00:00Z",
        "started_at": None,
        "finished_at": None,
        "character_count": 5,
        "cost": None,
        "balance_after": None,
        "voice_custom": False,
        "latency_ms": None,
        "error": None,
        "audio_url": None,
        **fields,
    }


def test_create_sends_the_caller_s_idempotency_key_and_returns_the_queued_job() -> None:
    api = MockAPI(envelope(job("queued"), "req-job", 202))
    created = client_for(api).tts.jobs.create(text="Salom", voice_id="uz-sardor", idempotency_key="order-42")
    assert isinstance(created, TtsJob)
    assert (created.status, created.request_id) == ("queued", "req-job")
    assert (api.requests[0].method, api.requests[0].url.raw_path) == ("POST", b"/api/v1/tts/jobs")
    assert api.requests[0].headers["idempotency-key"] == "order-42"
    assert body_of(api.requests[0]) == {"text": "Salom", "voice_id": "uz-sardor"}


def test_create_generates_an_idempotency_key_when_given_none() -> None:
    api = MockAPI(envelope(job("queued"), "req-job", 202))
    client_for(api).tts.jobs.create(text="Salom")
    assert UUID_V4.fullmatch(api.requests[0].headers["idempotency-key"])


def test_create_returns_the_job_for_a_200_replay_as_for_a_202() -> None:
    replay = json_response(200, {"data": job("succeeded"), "request_id": "r"}, {"idempotency-replayed": "1"})
    raw = client_for(MockAPI(replay)).tts.jobs.with_raw_response.create(text="Salom", idempotency_key="order-42")
    assert (raw.data.status, raw.status, raw.headers["idempotency-replayed"]) == ("succeeded", 200, "1")


def test_create_takes_a_synthesize_speech_request_as_keyword_arguments() -> None:
    api = MockAPI(envelope(job("queued"), status=202))
    speech: SynthesizeSpeechRequest = {"text": "Salom", "language": "uz", "quality": "high", "speed": 1.25}
    client_for(api).tts.jobs.create(**speech)
    assert body_of(api.requests[0]) == {"text": "Salom", "language": "uz", "quality": "high", "speed": 1.25}


def test_retrieve_reads_the_job_and_why_it_failed() -> None:
    failed = job("failed", error={"code": "synthesis_failed", "message": "Try again."})
    api = MockAPI(envelope(failed))
    found = client_for(api).tts.jobs.retrieve("job-1")
    assert found.error is not None
    assert (found.status, found.error.code) == ("failed", "synthesis_failed")
    assert api.requests[0].url.raw_path == b"/api/v1/tts/jobs/job-1"


def test_create_is_an_idempotent_call_and_retrieve_a_safe_one(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(MockAPI(envelope(job("queued"), status=202), envelope(job("running"))))
    client.tts.jobs.create(text="Salom")
    client.tts.jobs.retrieve("job-1")
    assert seen == ["idempotent", "safe"]
