"""The objects the API returns, and the types of what calls take."""

from .._uploads import FileContent, Uploadable
from .account import Balance, Usage, UsageByKey, UsageByService, UsagePeriod, UsageTotal
from .api_keys import (
    ApiKey,
    ApiKeyAccess,
    ApiKeyPermissions,
    ApiKeyPermissionsParam,
    CreateApiKeyRequest,
    UpdateApiKeyRequest,
)
from .audio import DialogueAudio, DialogueTurnTiming, SpeechAudio
from .chat import (
    ChatCompletion,
    ChatCompletionChoice,
    ChatCompletionChunk,
    ChatCompletionChunkChoice,
    ChatCompletionChunkDelta,
    ChatCompletionMessage,
    ChatCompletionUsage,
    ChatMessageParam,
    ChatRole,
    CreateChatCompletionRequest,
)
from .embeddings import CreateEmbeddingRequest, Embedding, EmbeddingResponse, EmbeddingUsage
from .errors import ErrorDetail, ErrorEnvelope, ErrorType
from .models import Model, ModelList
from .rerank import (
    RerankBilledUnits,
    RerankDocument,
    RerankMeta,
    RerankRequest,
    RerankResponse,
    RerankResult,
    RerankUsage,
)
from .shared import SpeechLanguage, SpeechQuality
from .stt import CreateTranscriptionRequest, Transcription, TranscriptionLanguage, TranscriptionSegment
from .tts import DialogueTurn, SynthesizeDialogueRequest, SynthesizeSpeechRequest, TtsJob, TtsJobError, TtsJobStatus
from .voices import (
    CreateVoiceRequest,
    ReplaceVoiceAudioRequest,
    UpdateVoiceRequest,
    Voice,
    VoiceCategory,
    VoiceType,
)

__all__ = [
    "ApiKey",
    "ApiKeyAccess",
    "ApiKeyPermissions",
    "ApiKeyPermissionsParam",
    "Balance",
    "ChatCompletion",
    "ChatCompletionChoice",
    "ChatCompletionChunk",
    "ChatCompletionChunkChoice",
    "ChatCompletionChunkDelta",
    "ChatCompletionMessage",
    "ChatCompletionUsage",
    "ChatMessageParam",
    "ChatRole",
    "CreateApiKeyRequest",
    "CreateChatCompletionRequest",
    "CreateEmbeddingRequest",
    "CreateTranscriptionRequest",
    "CreateVoiceRequest",
    "DialogueAudio",
    "DialogueTurn",
    "DialogueTurnTiming",
    "Embedding",
    "EmbeddingResponse",
    "EmbeddingUsage",
    "ErrorDetail",
    "ErrorEnvelope",
    "ErrorType",
    "FileContent",
    "Model",
    "ModelList",
    "ReplaceVoiceAudioRequest",
    "RerankBilledUnits",
    "RerankDocument",
    "RerankMeta",
    "RerankRequest",
    "RerankResponse",
    "RerankResult",
    "RerankUsage",
    "SpeechAudio",
    "SpeechLanguage",
    "SpeechQuality",
    "SynthesizeDialogueRequest",
    "SynthesizeSpeechRequest",
    "Transcription",
    "TranscriptionLanguage",
    "TranscriptionSegment",
    "TtsJob",
    "TtsJobError",
    "TtsJobStatus",
    "UpdateApiKeyRequest",
    "UpdateVoiceRequest",
    "Uploadable",
    "Usage",
    "UsageByKey",
    "UsageByService",
    "UsagePeriod",
    "UsageTotal",
    "Voice",
    "VoiceCategory",
    "VoiceType",
]
