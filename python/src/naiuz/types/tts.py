"""Text to speech: synthesis jobs, and what to synthesize."""

from __future__ import annotations

from collections.abc import Sequence
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
    """What to synthesize: the keyword arguments of `tts.synthesize` and `tts.jobs.create`. Only `text` is required."""

    voice_id: str | None
    """The voice to speak with, up to 128 characters."""
    language: SpeechLanguage | None
    """The text's language."""
    quality: SpeechQuality | None
    """`fast`, `standard` or `high`."""
    speed: float | None
    """From 0.5 to 2."""


class _DialogueTurnFields(TypedDict):
    voice_id: str
    """The voice that speaks the turn: a stock voice or one of your clones, up to 128 characters."""
    text: str
    """The turn's text. Length is measured as spoken length, the same measure billing uses: an emotion tag counts as
    one character, however long its name is spelled."""


class DialogueTurn(_DialogueTurnFields, total=False):
    """One turn of a dialogue: who speaks, and what. Only `voice_id` and `text` are required."""

    language: SpeechLanguage | None
    """The turn's own language, over the dialogue's."""
    quality: SpeechQuality | None
    """The turn's own quality, over the dialogue's: `fast`, `standard` or `high`."""
    speed: float | None
    """The turn's own speed, over the dialogue's, from 0.5 to 2."""


class _SynthesizeDialogueFields(TypedDict):
    turns: Sequence[DialogueTurn]
    """The script: 1 to 100 turns."""


class SynthesizeDialogueRequest(_SynthesizeDialogueFields, total=False):
    """A multi-speaker script to render into one WAV file: the keyword arguments of `tts.dialogue`.

    Billed per character, per turn, at that turn's own rate. Over 8000 characters in all raises PayloadTooLargeError
    (413 `input_too_large`), and a single turn over its own limit UnprocessableEntityError (422 `invalid_request`).
    """

    gap_ms: int | None
    """Milliseconds of silence between turns, from 0 to 5000."""
    language: SpeechLanguage | None
    """The language of each turn that doesn't set its own."""
    quality: SpeechQuality | None
    """The quality of each turn that doesn't set its own: `fast`, `standard` or `high`."""
    speed: float | None
    """The speed of each turn that doesn't set its own, from 0.5 to 2."""


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
