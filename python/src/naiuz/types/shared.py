"""Types more than one resource uses."""

from __future__ import annotations

from typing import Literal

SpeechLanguage = Literal[
    "uz", "ru", "en", "kk", "ky", "tk", "tg", "az", "tr", "ug", "tt", "ba",
    "hy", "ka", "uk", "be", "zh", "ja", "ko", "mn", "id", "vi", "th", "hi",
    "bn", "ur", "fa", "arb", "de", "fr", "es", "pt", "it", "nl", "sv", "pl",
]  # fmt: skip
"""A language the voice service speaks, by its code."""

SpeechQuality = Literal["fast", "standard", "high"]
"""How fast, or how well, speech is synthesized."""
