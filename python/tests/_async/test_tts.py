import json

import httpx
import pytest

from naiuz import APIError, GoneError, InsufficientQuotaError
from naiuz.types import (
    DialogueAudio,
    DialogueTurn,
    SpeechAudio,
    SynthesizeDialogueRequest,
    SynthesizeSpeechRequest,
    TtsJob,
)
from tests.helpers import KEY, UUID_V4, MockAPI, api_error, body_of, envelope, json_response

from .clients import client_for, retry_classes

WAV = b"RIFF\x24\x00\x00\x00WAVEfmt "
SALOM: list[DialogueTurn] = [{"voice_id": "uz-sardor", "text": "Salom!"}]


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


def wav(headers: dict[str, str] | None = None) -> httpx.Response:
    """An audio answer with synthesize's headers, and any others given."""
    spoken = {"content-type": "audio/wav", "x-cost": "12.5", "x-character-count": "5", "x-request-id": "req-audio"}
    return httpx.Response(200, content=WAV, headers={**spoken, **(headers or {})})


def page_with_key() -> httpx.Response:
    """A 200 that isn't audio, such as a captive portal's or a proxy's page, echoing the client's own key back."""
    return httpx.Response(
        200, content=f"<html>Sign in first: {KEY}</html>".encode(), headers={"content-type": "text/html"}
    )


async def test_create_sends_the_caller_s_idempotency_key_and_returns_the_queued_job() -> None:
    api = MockAPI(envelope(job("queued"), "req-job", 202))
    created = await client_for(api).tts.jobs.create(text="Salom", voice_id="uz-sardor", idempotency_key="order-42")
    assert isinstance(created, TtsJob)
    assert (created.status, created.request_id) == ("queued", "req-job")
    assert (api.requests[0].method, api.requests[0].url.raw_path) == ("POST", b"/api/v1/tts/jobs")
    assert api.requests[0].headers["idempotency-key"] == "order-42"
    assert body_of(api.requests[0]) == {"text": "Salom", "voice_id": "uz-sardor"}


async def test_create_generates_an_idempotency_key_when_given_none() -> None:
    api = MockAPI(envelope(job("queued"), "req-job", 202))
    await client_for(api).tts.jobs.create(text="Salom")
    assert UUID_V4.fullmatch(api.requests[0].headers["idempotency-key"])


async def test_create_returns_the_job_for_a_200_replay_as_for_a_202() -> None:
    replay = json_response(200, {"data": job("succeeded"), "request_id": "r"}, {"idempotency-replayed": "1"})
    raw = await client_for(MockAPI(replay)).tts.jobs.with_raw_response.create(text="Salom", idempotency_key="order-42")
    assert (raw.data.status, raw.status, raw.headers["idempotency-replayed"]) == ("succeeded", 200, "1")


async def test_create_takes_a_synthesize_speech_request_as_keyword_arguments() -> None:
    api = MockAPI(envelope(job("queued"), status=202))
    speech: SynthesizeSpeechRequest = {"text": "Salom", "language": "uz", "quality": "high", "speed": 1.25}
    await client_for(api).tts.jobs.create(**speech)
    assert body_of(api.requests[0]) == {"text": "Salom", "language": "uz", "quality": "high", "speed": 1.25}


async def test_retrieve_reads_the_job_and_why_it_failed() -> None:
    failed = job("failed", error={"code": "synthesis_failed", "message": "Try again."})
    api = MockAPI(envelope(failed))
    found = await client_for(api).tts.jobs.retrieve("job-1")
    assert found.error is not None
    assert (found.status, found.error.code) == ("failed", "synthesis_failed")
    assert api.requests[0].url.raw_path == b"/api/v1/tts/jobs/job-1"


async def test_create_is_an_idempotent_call_and_retrieve_a_safe_one(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(MockAPI(envelope(job("queued"), status=202), envelope(job("running"))))
    await client.tts.jobs.create(text="Salom")
    await client.tts.jobs.retrieve("job-1")
    assert seen == ["idempotent", "safe"]


async def test_synthesize_posts_the_text_with_an_idempotency_key_asks_for_audio_and_returns_the_wav() -> None:
    api = MockAPI(wav())
    audio = await client_for(api).tts.synthesize(text="Salom", voice_id="uz-sardor", idempotency_key="order-42")
    assert isinstance(audio, SpeechAudio)
    assert (audio.audio, audio.cost, audio.character_count, audio.request_id) == (WAV, 12.5, 5, "req-audio")
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("POST", b"/api/v1/tts/synthesize")
    assert (sent.headers["idempotency-key"], sent.headers["accept"]) == ("order-42", "audio/wav, application/json")
    assert body_of(sent) == {"text": "Salom", "voice_id": "uz-sardor"}


async def test_synthesize_takes_a_synthesize_speech_request_as_keyword_arguments() -> None:
    api = MockAPI(wav())
    speech: SynthesizeSpeechRequest = {
        "text": "Salom",
        "voice_id": "v",
        "language": "uz",
        "quality": "high",
        "speed": 1.25,
    }
    await client_for(api).tts.synthesize(**speech)
    assert body_of(api.requests[0]) == speech


async def test_dialogue_posts_the_script_and_returns_the_wav_with_where_each_turn_sits() -> None:
    turns = [{"index": 0, "voice_id": "uz-sardor", "start_s": 0, "end_s": 0.8, "duration_s": 0.8}]
    api = MockAPI(wav({"x-turns": json.dumps(turns), "x-turn-count": "1"}))
    script: SynthesizeDialogueRequest = {
        "turns": [{"voice_id": "uz-sardor", "text": "Salom!", "language": "uz", "quality": None, "speed": 1.1}],
        "gap_ms": 300,
        "language": "uz",
        "quality": "fast",
        "speed": None,
    }
    audio = await client_for(api).tts.dialogue(**script)
    assert isinstance(audio, DialogueAudio)
    assert ([turn.model_dump() for turn in audio.turns], audio.turn_count) == (turns, 1)
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("POST", b"/api/v1/tts/dialogue")
    assert UUID_V4.fullmatch(sent.headers["idempotency-key"])
    assert sent.headers["accept"] == "audio/wav, application/json"
    assert body_of(sent) == script


async def test_synthesize_raises_the_api_s_error_answer_such_as_a_402_for_a_low_balance() -> None:
    with pytest.raises(InsufficientQuotaError):
        await client_for(MockAPI(api_error(402, "insufficient_balance"))).tts.synthesize(text="Salom")


async def test_each_audio_call_raises_api_error_with_the_key_redacted_for_a_200_that_isn_t_audio() -> None:
    api = MockAPI(page_with_key(), page_with_key(), page_with_key())
    client = client_for(api, max_retries=2)
    with pytest.raises(APIError) as synthesized:
        await client.tts.synthesize(text="Salom")
    with pytest.raises(APIError) as rendered:
        await client.tts.dialogue(turns=SALOM)
    with pytest.raises(APIError) as downloaded:
        await client.tts.jobs.audio("job-1")
    for caught in (synthesized, rendered, downloaded):
        assert (caught.value.status, caught.value.message) == (200, "OK: <html>Sign in first: [redacted]</html>")
    assert len(api.requests) == 3


async def test_jobs_audio_reads_a_finished_job_s_wav_asking_for_audio_with_no_idempotency_key() -> None:
    api = MockAPI(wav())
    audio = await client_for(api).tts.jobs.audio("job-1")
    assert audio.audio == WAV
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("GET", b"/api/v1/tts/jobs/job-1/audio")
    assert sent.headers["accept"] == "audio/wav, application/json"
    assert "idempotency-key" not in sent.headers


async def test_jobs_audio_raises_gone_error_once_the_audio_is_past_its_24_hours() -> None:
    with pytest.raises(GoneError) as caught:
        await client_for(MockAPI(api_error(410, "audio_expired"))).tts.jobs.audio("job-1")
    assert (caught.value.status, caught.value.code) == (410, "audio_expired")


async def test_synthesize_and_dialogue_are_idempotent_calls_and_jobs_audio_a_safe_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(MockAPI(wav(), wav(), wav()))
    await client.tts.synthesize(text="Salom")
    await client.tts.dialogue(turns=SALOM)
    await client.tts.jobs.audio("job-1")
    assert seen == ["idempotent", "idempotent", "safe"]


async def test_with_raw_response_gives_the_audio_with_its_status_and_headers() -> None:
    client = client_for(MockAPI(wav({"idempotency-replayed": "1"}), wav(), wav()))
    spoken = await client.tts.with_raw_response.synthesize(text="Salom", idempotency_key="order-42")
    rendered = await client.tts.with_raw_response.dialogue(turns=SALOM)
    downloaded = await client.tts.jobs.with_raw_response.audio("job-1")
    assert (spoken.data.replayed, spoken.status, spoken.headers["x-request-id"]) == (True, 200, "req-audio")
    assert (rendered.data.turns, downloaded.data.audio) == ([], WAV)
