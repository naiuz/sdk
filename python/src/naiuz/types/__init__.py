"""The objects the API returns, and the types of what calls take."""

from .account import Balance, Usage, UsageByKey, UsageByService, UsagePeriod, UsageTotal
from .errors import ErrorDetail, ErrorEnvelope, ErrorType
from .shared import SpeechLanguage, SpeechQuality
from .tts import SynthesizeSpeechRequest, TtsJob, TtsJobError, TtsJobStatus
from .voices import UpdateVoiceRequest, Voice, VoiceCategory, VoiceType

__all__ = [
    "Balance",
    "ErrorDetail",
    "ErrorEnvelope",
    "ErrorType",
    "SpeechLanguage",
    "SpeechQuality",
    "SynthesizeSpeechRequest",
    "TtsJob",
    "TtsJobError",
    "TtsJobStatus",
    "UpdateVoiceRequest",
    "Usage",
    "UsageByKey",
    "UsageByService",
    "UsagePeriod",
    "UsageTotal",
    "Voice",
    "VoiceCategory",
    "VoiceType",
]
