# Written by scripts/unasync.py from src/naiuz/_async/resources/tts.py. Edit that file, then run the script.
"""Text to speech."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_dialogue_audio, read_envelope, read_speech_audio
from ...types.audio import DialogueAudio, SpeechAudio
from ...types.shared import SpeechLanguage, SpeechQuality
from ...types.tts import DialogueTurn, TtsJob
from .._http import HttpClient
from .._io import to_raw
from .._resource import APIResource

AUDIO = "audio/wav, application/json"
"""What the audio calls accept: the WAV, or an error in the API's JSON envelope."""


class TtsJobs(APIResource):
    """Synthesis jobs: queue a long text, then poll the job until it finishes."""

    @property
    def with_raw_response(self) -> TtsJobsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return TtsJobsWithRawResponse(self)

    def create(
        self,
        *,
        text: str,
        voice_id: str | NotGiven | None = NOT_GIVEN,
        language: SpeechLanguage | NotGiven | None = NOT_GIVEN,
        quality: SpeechQuality | NotGiven | None = NOT_GIVEN,
        speed: float | NotGiven | None = NOT_GIVEN,
        idempotency_key: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> TtsJob:
        """Queues a synthesis, and returns the job at once, whether the API answers 202 (queued) or 200 (a replay).

        Poll `retrieve` until `status` is `succeeded` or `failed`; the charge lands only when the job succeeds. Every
        call sends an Idempotency-Key, `idempotency_key` or a generated one, the same on each retry, so a retry never
        queues a second job: the same key again returns the job it created, whatever its state.

        Args:
            text: The text to speak. Length is measured as spoken length, the same measure billing uses: an emotion
                tag counts as one character, however long its name is spelled.
            voice_id: The voice to speak with, up to 128 characters.
            language: The text's language.
            quality: `fast`, `standard` or `high`.
            speed: From 0.5 to 2.
            idempotency_key: Sent as the Idempotency-Key header, at most 191 characters. None or "" sends a
                generated UUIDv4.
        """
        options = RequestOptions(
            timeout=timeout, max_retries=max_retries, extra_headers=extra_headers, idempotency_key=idempotency_key
        )
        body = given(text=text, voice_id=voice_id, language=language, quality=quality, speed=speed)
        request = APIRequest("POST", "/tts/jobs", "idempotent", body=body, options=options)
        return self._http.request(request, read_envelope(TtsJob))

    def retrieve(
        self,
        id: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> TtsJob:
        """The job and where it stands: `queued`, `running`, `succeeded` or `failed`. A final state never changes."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/tts/jobs/{id}", "safe", path_params={"id": id}, options=options)
        return self._http.request(request, read_envelope(TtsJob))

    def audio(
        self,
        id: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> SpeechAudio:
        """The WAV of a job that has succeeded, with the headers synthesize sends.

        Before then it raises ConflictError: `job_not_finished` while the job is queued or running, and `job_failed`
        once it has failed. The audio is kept for 24 hours after the job finishes; after that it raises GoneError
        (410 `audio_expired`), so download it promptly.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        path = "/tts/jobs/{id}/audio"
        request = APIRequest("GET", path, "safe", path_params={"id": id}, accept=AUDIO, options=options)
        return self._http.request(request, read_speech_audio)


class TtsJobsWithRawResponse:
    """The synthesis jobs' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, jobs: TtsJobs) -> None:
        self.create = to_raw(jobs.create)
        self.retrieve = to_raw(jobs.retrieve)
        self.audio = to_raw(jobs.audio)


class Tts(APIResource):
    """Text to speech."""

    jobs: TtsJobs
    """Synthesis jobs: queue a long text, then poll the job until it finishes."""

    def __init__(self, http: HttpClient) -> None:
        super().__init__(http)
        self.jobs = TtsJobs(http)

    @property
    def with_raw_response(self) -> TtsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return TtsWithRawResponse(self)

    def synthesize(
        self,
        *,
        text: str,
        voice_id: str | NotGiven | None = NOT_GIVEN,
        language: SpeechLanguage | NotGiven | None = NOT_GIVEN,
        quality: SpeechQuality | NotGiven | None = NOT_GIVEN,
        speed: float | NotGiven | None = NOT_GIVEN,
        idempotency_key: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> SpeechAudio:
        """Synthesizes speech from text, and returns the WAV with what its headers say: the price, the characters
        billed, your balance after the charge, and more.

        Every call sends an Idempotency-Key, `idempotency_key` or a generated one, the same on each retry, so a retry
        returns the first answer instead of charging again; the same key with a different body raises ConflictError
        (409 `idempotency_conflict`). Emotion tags such as `[laughter]` are acted out rather than read, and each bills
        as one character.

        Args:
            text: The text to speak. Length is measured as spoken length, the same measure billing uses: an emotion
                tag counts as one character, however long its name is spelled.
            voice_id: The voice to speak with: a stock voice or one of your clones, up to 128 characters.
            language: The text's language.
            quality: `fast` (lowest latency), `standard` (the default, balanced) or `high` (best fidelity, slowest).
            speed: From 0.5 to 2.
            idempotency_key: Sent as the Idempotency-Key header, at most 191 characters. None or "" sends a
                generated UUIDv4.
        """
        options = RequestOptions(
            timeout=timeout, max_retries=max_retries, extra_headers=extra_headers, idempotency_key=idempotency_key
        )
        body = given(text=text, voice_id=voice_id, language=language, quality=quality, speed=speed)
        request = APIRequest("POST", "/tts/synthesize", "idempotent", body=body, accept=AUDIO, options=options)
        return self._http.request(request, read_speech_audio)

    def dialogue(
        self,
        *,
        turns: Sequence[DialogueTurn],
        gap_ms: int | NotGiven | None = NOT_GIVEN,
        language: SpeechLanguage | NotGiven | None = NOT_GIVEN,
        quality: SpeechQuality | NotGiven | None = NOT_GIVEN,
        speed: float | NotGiven | None = NOT_GIVEN,
        idempotency_key: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> DialogueAudio:
        """Renders a multi-speaker script into one WAV file, and returns it with its headers and where each turn sits.

        Billed per character, per turn, at that turn's own rate. A long script can take about four and a half
        minutes, close to the default timeout: pass a longer `timeout` for one. The Idempotency-Key works as it does
        on `synthesize`.

        Args:
            turns: The script: 1 to 100 turns, each a `voice_id` and its `text`, and optionally its own `language`,
                `quality` and `speed`.
            gap_ms: Milliseconds of silence between turns, from 0 to 5000.
            language: The language of each turn that doesn't set its own.
            quality: The quality of each turn that doesn't set its own: `fast`, `standard` or `high`.
            speed: The speed of each turn that doesn't set its own, from 0.5 to 2.
            idempotency_key: Sent as the Idempotency-Key header, at most 191 characters. None or "" sends a
                generated UUIDv4.
        """
        options = RequestOptions(
            timeout=timeout, max_retries=max_retries, extra_headers=extra_headers, idempotency_key=idempotency_key
        )
        body = given(turns=turns, gap_ms=gap_ms, language=language, quality=quality, speed=speed)
        request = APIRequest("POST", "/tts/dialogue", "idempotent", body=body, accept=AUDIO, options=options)
        return self._http.request(request, read_dialogue_audio)


class TtsWithRawResponse:
    """Text to speech's methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, tts: Tts) -> None:
        self.synthesize = to_raw(tts.synthesize)
        self.dialogue = to_raw(tts.dialogue)
