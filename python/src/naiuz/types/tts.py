"""Text to speech: synthesis jobs, and what to synthesize."""

from __future__ import annotations

from typing import Literal, TypedDict

from .._models import BaseModel, WithRequestId
from .shared import SpeechLanguage, SpeechQuality

TtsJobStatus = Literal["queued", "running", "succeeded", "failed"]
"""Where a synthesis job stands. `succeeded` and `failed` are final."""


class _SynthesizeSpeechFields(TypedDict):
    text: str
    """The text to speak. Length is measured as spoken length, the same measure billing uses: an emotion tag counts
    as one character, however long its name is spelled."""


class SynthesizeSpeechRequest(_SynthesizeSpeechFields, total=False):
    """What to synthesize: the keyword arguments of `tts.jobs.create`. Only `text` is required."""

    voice_id: str | None
    """The voice to speak with, up to 128 characters."""
    language: SpeechLanguage | None
    """The text's language."""
    quality: SpeechQuality | None
    """`fast`, `standard` or `high`."""
    speed: float | None
    """From 0.5 to 2."""


class TtsJobError(BaseModel):
    """Why a job failed."""

    code: str
    """`insufficient_balance`, `voice_unavailable`, `synthesis_failed`, `storage_failed` or `queue_timeout`. None of
    them is charged."""
    message: str
    """What went wrong, written for people."""


class TtsJob(WithRequestId):
    """A synthesis job and where it stands. A final state never changes.

    `cost`, `balance_after`, `latency_ms` and `audio_url` are set once it has `succeeded`, and `error` once it has
    `failed`.
    """

    id: str
    """The job's id."""
    status: TtsJobStatus | str
    """`queued`, `running`, `succeeded` or `failed`."""
    created_at: str
    """When the job was created (ISO 8601)."""
    started_at: str | None
    """When a worker started on the job, or None while it is queued."""
    finished_at: str | None
    """When the job succeeded or failed, or None until then."""
    character_count: int
    """The text's spoken length, the measure billing uses."""
    cost: float | None
    """The price, in UZS, once the job has succeeded; None until then."""
    balance_after: float | None
    """The balance after the charge, once the job has succeeded; None until then."""
    voice_custom: bool
    """Whether the voice is one of your clones."""
    latency_ms: float | None
    """How long synthesis took, in milliseconds, once the job has succeeded; None until then."""
    error: TtsJobError | None
    """Why the job failed, once it has failed; None otherwise."""
    audio_url: str | None
    """Where to download the audio once the job has succeeded; None until then."""
