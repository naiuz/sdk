"""Text to speech."""

from __future__ import annotations

from collections.abc import Mapping

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope
from ...types.shared import SpeechLanguage, SpeechQuality
from ...types.tts import TtsJob
from .._http import AsyncHttpClient
from .._io import to_raw
from .._resource import AsyncAPIResource


class AsyncTtsJobs(AsyncAPIResource):
    """Synthesis jobs: queue a long text, then poll the job until it finishes."""

    @property
    def with_raw_response(self) -> AsyncTtsJobsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AsyncTtsJobsWithRawResponse(self)

    async def create(
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
        return await self._http.request(request, read_envelope(TtsJob))

    async def retrieve(
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
        return await self._http.request(request, read_envelope(TtsJob))


class AsyncTtsJobsWithRawResponse:
    """The synthesis jobs' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, jobs: AsyncTtsJobs) -> None:
        self.create = to_raw(jobs.create)
        self.retrieve = to_raw(jobs.retrieve)


class AsyncTts(AsyncAPIResource):
    """Text to speech."""

    jobs: AsyncTtsJobs
    """Synthesis jobs: queue a long text, then poll the job until it finishes."""

    def __init__(self, http: AsyncHttpClient) -> None:
        super().__init__(http)
        self.jobs = AsyncTtsJobs(http)
