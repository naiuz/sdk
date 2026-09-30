"""Stock voices and your organization's voice clones."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, TypedDict

from .._models import WithRequestId
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
