"""Synthesized speech: the WAV file's bytes, and what the answer's headers say about it."""

from __future__ import annotations

import os
from dataclasses import dataclass, fields
from pathlib import Path

from .._errors import NeuronAIError
from .._models import BaseModel


class DialogueTurnTiming(BaseModel):
    """Where one turn of a dialogue is in its audio, from the `X-Turns` header. Times are in seconds."""

    index: int
    """The turn's position in the script, from 0."""
    voice_id: str
    """The voice that spoke it."""
    start_s: float
    """Where the turn starts."""
    end_s: float
    """Where it ends."""
    duration_s: float
    """How long it lasts."""


@dataclass(frozen=True, repr=False)
class SpeechAudio:
    """Synthesized speech: the WAV file's bytes, and what the answer's headers say about it.

    A number field is None when the answer lacks its header, and a flag is False.
    """

    audio: bytes
    """The WAV file's bytes."""
    content_type: str
    """The media type, `audio/wav`."""
    cost: float | None
    """The price billed, in UZS (`X-Cost`)."""
    character_count: int | None
    """The characters billed (`X-Character-Count`): an emotion tag counts as one."""
    balance: float | None
    """Your balance after the charge, in UZS (`X-Balance`)."""
    voice_custom: bool
    """Whether the voice is one of your clones (`X-Voice-Custom: 1`); for a dialogue, whether any turn's is."""
    latency_ms: float | None
    """How long the voice took, in milliseconds (`X-Latency-Ms`)."""
    replayed: bool
    """Whether this answer replays an earlier call with the same Idempotency-Key (`Idempotency-Replayed: 1`), and so
    charged nothing new."""
    request_id: str | None
    """The request's ID (`X-Request-Id`), to quote to support."""

    def save(self, path: str | os.PathLike[str]) -> None:
        """Writes the WAV file to `path`, replacing a file already there.

        A write that fails raises NeuronAIError, naming the path and why.
        """
        try:
            Path(path).write_bytes(self.audio)
        except OSError as error:
            raise NeuronAIError(f"The audio couldn't be written to {path}: {error.strerror or error}") from error

    def __repr__(self) -> str:
        shown = (f"{field.name}={getattr(self, field.name)!r}" for field in fields(self) if field.name != "audio")
        return f"{type(self).__name__}(audio=<{len(self.audio)} bytes>, {', '.join(shown)})"


@dataclass(frozen=True, repr=False)
class DialogueAudio(SpeechAudio):
    """A dialogue's audio: everything SpeechAudio has, and where each turn sits in it."""

    turns: list[DialogueTurnTiming]
    """Where each turn is in the audio (`X-Turns`), so you can seek to a line; empty when the answer lacks the header,
    or it isn't a list of turns."""
    turn_count: int | None
    """The number of turns rendered (`X-Turn-Count`)."""
