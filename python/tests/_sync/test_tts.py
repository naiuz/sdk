# Written by scripts/unasync.py from tests/_async/test_tts.py. Edit that file, then run the script.
import json
import time

import httpx
import pytest

from naiuz import APIError, AuthenticationError, GoneError, InsufficientQuotaError, NeuronAIError, WaitTimeoutError
from naiuz.types import (
    DialogueAudio,
    DialogueTurn,
    SpeechAudio,
    SynthesizeDialogueRequest,
    SynthesizeSpeechRequest,
    TtsJob,
)
from tests.helpers import KEY, UUID_V4, MockAPI, api_error, body_of, envelope, json_response, refused

from ._io import Body, answer
from .clients import Clock, client_for, jobs_on, options_of, retry_classes

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


def test_synthesize_posts_the_text_with_an_idempotency_key_asks_for_audio_and_returns_the_wav() -> None:
    api = MockAPI(wav())
    audio = client_for(api).tts.synthesize(text="Salom", voice_id="uz-sardor", idempotency_key="order-42")
    assert isinstance(audio, SpeechAudio)
    assert (audio.audio, audio.cost, audio.character_count, audio.request_id) == (WAV, 12.5, 5, "req-audio")
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("POST", b"/api/v1/tts/synthesize")
    assert (sent.headers["idempotency-key"], sent.headers["accept"]) == ("order-42", "audio/wav, application/json")
    assert body_of(sent) == {"text": "Salom", "voice_id": "uz-sardor"}


def test_synthesize_takes_a_synthesize_speech_request_as_keyword_arguments() -> None:
    api = MockAPI(wav())
    speech: SynthesizeSpeechRequest = {
        "text": "Salom",
        "voice_id": "v",
        "language": "uz",
        "quality": "high",
        "speed": 1.25,
    }
    client_for(api).tts.synthesize(**speech)
    assert body_of(api.requests[0]) == speech


def test_dialogue_posts_the_script_and_returns_the_wav_with_where_each_turn_sits() -> None:
    turns = [{"index": 0, "voice_id": "uz-sardor", "start_s": 0, "end_s": 0.8, "duration_s": 0.8}]
    api = MockAPI(wav({"x-turns": json.dumps(turns), "x-turn-count": "1"}))
    script: SynthesizeDialogueRequest = {
        "turns": [{"voice_id": "uz-sardor", "text": "Salom!", "language": "uz", "quality": None, "speed": 1.1}],
        "gap_ms": 300,
        "language": "uz",
        "quality": "fast",
        "speed": None,
    }
    audio = client_for(api).tts.dialogue(**script)
    assert isinstance(audio, DialogueAudio)
    assert ([turn.model_dump() for turn in audio.turns], audio.turn_count) == (turns, 1)
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("POST", b"/api/v1/tts/dialogue")
    assert UUID_V4.fullmatch(sent.headers["idempotency-key"])
    assert sent.headers["accept"] == "audio/wav, application/json"
    assert body_of(sent) == script


def test_synthesize_raises_the_api_s_error_answer_such_as_a_402_for_a_low_balance() -> None:
    with pytest.raises(InsufficientQuotaError):
        client_for(MockAPI(api_error(402, "insufficient_balance"))).tts.synthesize(text="Salom")


def test_each_audio_call_raises_api_error_with_the_key_redacted_for_a_200_that_isn_t_audio() -> None:
    api = MockAPI(page_with_key(), page_with_key(), page_with_key())
    client = client_for(api, max_retries=2)
    with pytest.raises(APIError) as synthesized:
        client.tts.synthesize(text="Salom")
    with pytest.raises(APIError) as rendered:
        client.tts.dialogue(turns=SALOM)
    with pytest.raises(APIError) as downloaded:
        client.tts.jobs.audio("job-1")
    for caught in (synthesized, rendered, downloaded):
        assert (caught.value.status, caught.value.message) == (200, "OK: <html>Sign in first: [redacted]</html>")
    assert len(api.requests) == 3


def test_jobs_audio_reads_a_finished_job_s_wav_asking_for_audio_with_no_idempotency_key() -> None:
    api = MockAPI(wav())
    audio = client_for(api).tts.jobs.audio("job-1")
    assert audio.audio == WAV
    sent = api.requests[0]
    assert (sent.method, sent.url.raw_path) == ("GET", b"/api/v1/tts/jobs/job-1/audio")
    assert sent.headers["accept"] == "audio/wav, application/json"
    assert "idempotency-key" not in sent.headers


def test_jobs_audio_raises_gone_error_once_the_audio_is_past_its_24_hours() -> None:
    with pytest.raises(GoneError) as caught:
        client_for(MockAPI(api_error(410, "audio_expired"))).tts.jobs.audio("job-1")
    assert (caught.value.status, caught.value.code) == (410, "audio_expired")


def test_synthesize_and_dialogue_are_idempotent_calls_and_jobs_audio_a_safe_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = retry_classes(monkeypatch)
    client = client_for(MockAPI(wav(), wav(), wav()))
    client.tts.synthesize(text="Salom")
    client.tts.dialogue(turns=SALOM)
    client.tts.jobs.audio("job-1")
    assert seen == ["idempotent", "idempotent", "safe"]


def test_with_raw_response_gives_the_audio_with_its_status_and_headers() -> None:
    client = client_for(MockAPI(wav({"idempotency-replayed": "1"}), wav(), wav()))
    spoken = client.tts.with_raw_response.synthesize(text="Salom", idempotency_key="order-42")
    rendered = client.tts.with_raw_response.dialogue(turns=SALOM)
    downloaded = client.tts.jobs.with_raw_response.audio("job-1")
    assert (spoken.data.replayed, spoken.status, spoken.headers["x-request-id"]) == (True, 200, "req-audio")
    assert (rendered.data.turns, downloaded.data.audio) == ([], WAV)


def queued() -> httpx.Response:
    return envelope(job("queued"), "req-create", 202)


def polled(status: str) -> httpx.Response:
    return envelope(job(status), f"req-{status}")


def test_create_and_wait_polls_every_2_seconds_until_the_job_succeeds_and_returns_it() -> None:
    api, clock = MockAPI(queued(), polled("running"), polled("succeeded")), Clock()
    done = jobs_on(api, clock).create_and_wait(text="Salom")
    assert (done.status, done.request_id) == ("succeeded", "req-succeeded")
    assert clock.sleeps == [2.0, 2.0]
    assert [(request.method, request.url.raw_path) for request in api.requests] == [
        ("POST", b"/api/v1/tts/jobs"),
        ("GET", b"/api/v1/tts/jobs/job-1"),
        ("GET", b"/api/v1/tts/jobs/job-1"),
    ]


def test_create_and_wait_returns_a_job_that_failed_as_well() -> None:
    done = jobs_on(MockAPI(queued(), polled("failed")), Clock()).create_and_wait(text="Salom")
    assert done.status == "failed"


def test_create_and_wait_returns_a_job_already_final_without_polling() -> None:
    api, clock = MockAPI(envelope(job("succeeded"), "req-replay")), Clock()
    assert (jobs_on(api, clock).create_and_wait(text="Salom")).status == "succeeded"
    assert (len(api.requests), clock.sleeps) == (1, [])


def test_create_and_wait_raises_wait_timeout_error_with_the_job_as_last_seen() -> None:
    api, clock = MockAPI(queued(), polled("running"), polled("running")), Clock()
    with pytest.raises(WaitTimeoutError) as caught:
        jobs_on(api, clock).create_and_wait(text="Salom", timeout=5)
    assert (caught.value.job.status, caught.value.job.request_id) == ("running", "req-running")
    assert str(caught.value) == "The job job-1 was still running when the wait ran out."
    assert (len(api.requests), clock.sleeps) == (3, [2.0, 2.0, 1.0])


def test_create_and_wait_keeps_polling_through_failures_the_safe_class_would_retry() -> None:
    api = MockAPI(
        queued(),
        httpx.Response(502, content=b"<html>Bad Gateway</html>"),
        refused(),
        api_error(429, "rate_limit_exceeded", {"retry-after": "5"}),
        api_error(503, "service_unavailable"),
        polled("succeeded"),
    )
    clock = Clock()
    done = jobs_on(api, clock).create_and_wait(text="Salom")
    assert done.status == "succeeded"
    assert clock.sleeps == [2.0, 2.0, 2.0, 5.0, 2.0]


def test_create_and_wait_ends_at_once_on_an_error_it_can_t_outlast_such_as_a_401() -> None:
    api = MockAPI(queued(), api_error(401, "invalid_api_key"))
    with pytest.raises(AuthenticationError):
        jobs_on(api, Clock()).create_and_wait(text="Salom")
    assert len(api.requests) == 2


def test_create_and_wait_raises_wait_timeout_error_when_failures_run_past_the_deadline() -> None:
    api = MockAPI(queued(), api_error(503, "service_unavailable"), api_error(503, "service_unavailable"))
    with pytest.raises(WaitTimeoutError) as caught:
        jobs_on(api, Clock()).create_and_wait(text="Salom", timeout=5)
    assert (caught.value.job.status, caught.value.job.id) == ("queued", "job-1")
    assert len(api.requests) == 3


def test_create_and_wait_sends_its_key_with_the_create_and_extra_headers_with_every_request() -> None:
    api, clock = MockAPI(queued(), polled("succeeded")), Clock()
    jobs = jobs_on(api, clock)
    jobs.create_and_wait(
        text="Salom", idempotency_key="order-42", extra_headers={"x-trace": "t1"}, poll_interval=0.5
    )
    assert [request.headers.get("idempotency-key") for request in api.requests] == ["order-42", None]
    assert [request.headers["x-trace"] for request in api.requests] == ["t1", "t1"]
    assert clock.sleeps == [0.5]


def test_each_poll_is_one_attempt_with_the_client_s_timeout_cut_to_the_time_left(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = options_of(monkeypatch)
    api = MockAPI(queued(), polled("running"), polled("running"))
    with pytest.raises(WaitTimeoutError):
        jobs_on(api, Clock()).create_and_wait(text="Salom", timeout=5, max_retries=3)
    assert seen == [("POST", None, 3), ("GET", 3.0, 0), ("GET", 1.0, 0)]


@pytest.mark.parametrize(
    ("option", "value"), [("poll_interval", 0), ("poll_interval", True), ("timeout", float("nan")), ("timeout", -1)]
)
def test_create_and_wait_refuses_an_invalid_poll_interval_or_timeout_sending_nothing(
    option: str, value: object
) -> None:
    api = MockAPI()
    with pytest.raises(NeuronAIError, match=rf"^{option} must be a number of seconds, more than 0 and at most"):
        jobs_on(api, Clock()).create_and_wait(text="Salom", **{option: value})  # type: ignore[arg-type]
    assert api.requests == []


def test_create_and_wait_cuts_a_poll_still_in_flight_at_the_deadline() -> None:
    """The poll's answer drips forever: the wait still ends near its own deadline, not the client's 60 s timeout."""
    api = MockAPI(queued(), answer(Body(b"{", gap=0.02, forever=True)))
    started = time.monotonic()
    with pytest.raises(WaitTimeoutError) as caught:
        client_for(api, timeout=60).tts.jobs.create_and_wait(text="Salom", timeout=0.3, poll_interval=0.1)
    assert time.monotonic() - started < 2
    assert caught.value.job.status == "queued"
