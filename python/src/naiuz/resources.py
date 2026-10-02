"""The client's resources, for type annotations. Reach them through a client, such as `client.voices`."""

from ._async.resources.account import AsyncAccount
from ._async.resources.api_keys import AsyncApiKeys
from ._async.resources.chat import AsyncChat, AsyncCompletions
from ._async.resources.embeddings import AsyncEmbeddings
from ._async.resources.models import AsyncModels
from ._async.resources.rerank import AsyncRerank
from ._async.resources.stt import AsyncStt
from ._async.resources.tts import AsyncTts, AsyncTtsJobs
from ._async.resources.voices import AsyncVoices
from ._sync.resources.account import Account
from ._sync.resources.api_keys import ApiKeys
from ._sync.resources.chat import Chat, Completions
from ._sync.resources.embeddings import Embeddings
from ._sync.resources.models import Models
from ._sync.resources.rerank import Rerank
from ._sync.resources.stt import Stt
from ._sync.resources.tts import Tts, TtsJobs
from ._sync.resources.voices import Voices

__all__ = [
    "Account",
    "ApiKeys",
    "AsyncAccount",
    "AsyncApiKeys",
    "AsyncChat",
    "AsyncCompletions",
    "AsyncEmbeddings",
    "AsyncModels",
    "AsyncRerank",
    "AsyncStt",
    "AsyncTts",
    "AsyncTtsJobs",
    "AsyncVoices",
    "Chat",
    "Completions",
    "Embeddings",
    "Models",
    "Rerank",
    "Stt",
    "Tts",
    "TtsJobs",
    "Voices",
]
