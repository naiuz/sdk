"""The objects the API returns, and the types of what calls take."""

from .account import Balance, Usage, UsageByKey, UsageByService, UsagePeriod, UsageTotal
from .api_keys import (
    ApiKey,
    ApiKeyAccess,
    ApiKeyPermissions,
    ApiKeyPermissionsParam,
    CreateApiKeyRequest,
    UpdateApiKeyRequest,
)
from .errors import ErrorDetail, ErrorEnvelope, ErrorType
from .shared import SpeechLanguage, SpeechQuality
from .tts import SynthesizeSpeechRequest, TtsJob, TtsJobError, TtsJobStatus
from .voices import UpdateVoiceRequest, Voice, VoiceCategory, VoiceType

__all__ = [
    "ApiKey",
    "ApiKeyAccess",
    "ApiKeyPermissions",
    "ApiKeyPermissionsParam",
    "Balance",
    "CreateApiKeyRequest",
    "ErrorDetail",
    "ErrorEnvelope",
    "ErrorType",
    "SpeechLanguage",
    "SpeechQuality",
    "SynthesizeSpeechRequest",
    "TtsJob",
    "TtsJobError",
    "TtsJobStatus",
    "UpdateApiKeyRequest",
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
