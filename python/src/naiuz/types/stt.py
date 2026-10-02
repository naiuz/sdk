"""Speech to text."""

from __future__ import annotations

from typing import Literal, TypedDict

from .._models import BaseModel, WithRequestId
from .._uploads import Uploadable

TranscriptionLanguage = Literal["uz", "ru", "en", "kk", "tk", "tg", "tr", "az", "ja", "de", "ko"]
"""A language transcription takes, by its code."""


class CreateTranscriptionRequest(TypedDict):
    """Audio to transcribe, sent as multipart/form-data: the keyword arguments of `stt.transcribe`."""

    file: Uploadable
    """The audio: MP3, WAV, OGG, FLAC, M4A or WebM, at most 25 MB."""
    language: TranscriptionLanguage
    """The language spoken in it."""


class TranscriptionSegment(BaseModel):
    """A timed piece of the text."""

    start: float
    """Where the piece starts in the audio, in seconds."""
    end: float
    """Where it ends, in seconds."""
    text: str
    """What was said."""


class Transcription(WithRequestId):
    """A transcription: the text, the language, the duration, timed segments, the price and your balance after the
    charge."""

    text: str
    """The text of the whole audio."""
    language: str
    """The language's code."""
    duration_seconds: float
    """The audio's duration, in seconds. The price is set by it, at the per-minute rate."""
    segments: list[TranscriptionSegment]
    """The text in timed pieces, in order: where each starts and ends in the audio, in seconds, and what was said."""
    cost: float
    """The price billed, in UZS."""
    balance: float
    """Your balance after the charge, in UZS."""
