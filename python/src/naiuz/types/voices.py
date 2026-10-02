"""Stock voices and your organization's voice clones."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, TypedDict

from .._models import WithRequestId
from .._uploads import Uploadable
from .shared import SpeechLanguage

VoiceCategory = Literal["conversational", "narration", "characters", "social_media", "educational"]
"""What a voice is for."""

VoiceType = Literal["custom", "stock"]
"""`stock` for the catalog's voices, `custom` for your organization's voice clones."""


class Voice(WithRequestId):
    """A stock voice, or one of your organization's voice clones."""

    id: str
    """The voice's id: pass it as `voice_id`."""
    name: str
    """The voice's name."""
    language: str
    """The code of the language the voice speaks."""
    tags: list[str]
    """The voice's tags: always a list."""
    type: VoiceType | str
    """`stock` or `custom`."""
    category: str | None = None
    """The voice's category, or None; the API may leave it out."""
    ref_text: str | None = None
    """The reference clip's transcript, or None; the API may leave it out."""
    created_at: str | None = None
    """When the voice was created (ISO 8601), or None; the API may leave it out."""


class UpdateVoiceRequest(TypedDict, total=False):
    """The fields `voices.update` changes, each optional: one left out is left alone."""

    name: str
    """The new name, up to 120 characters."""
    category: VoiceCategory
    """The new category."""
    language: SpeechLanguage
    """The new language. Changing it re-creates the voice."""
    ref_text: str | None
    """The new transcript, up to 1000 characters. None or "" clears it. Changing it re-creates the voice."""
    tags: Sequence[str] | None
    """The new tags, up to 32 characters each. None or [] clears them, and blank tags are dropped."""


class _CreateVoiceFields(TypedDict):
    name: str
    """The voice's name, up to 120 characters."""
    language: SpeechLanguage
    """The language the voice speaks."""
    ref_audio: Uploadable
    """A 10-15 second reference clip: WAV, MP3, OGG or FLAC, at most 10 MB."""


class CreateVoiceRequest(_CreateVoiceFields, total=False):
    """A voice clone to create, sent as multipart/form-data: the keyword arguments of `voices.create`."""

    ref_text: str | None
    """What the clip says, up to 1000 characters."""
    category: VoiceCategory
    """What the voice is for."""
    tags: Sequence[str] | None
    """Tags, up to 32 characters each, each sent as its own `tags[]` field. Blank tags are dropped."""


class _ReplaceVoiceAudioFields(TypedDict):
    ref_audio: Uploadable
    """The new reference clip, in the formats and size a new clone takes: WAV, MP3, OGG or FLAC, at most 10 MB."""


class ReplaceVoiceAudioRequest(_ReplaceVoiceAudioFields, total=False):
    """A voice clone's new reference clip, sent as multipart/form-data: the keyword arguments of
    `voices.replace_audio`."""

    ref_text: str | None
    """What the new clip says, up to 1000 characters."""
