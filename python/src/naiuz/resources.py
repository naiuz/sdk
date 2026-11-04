"""The client's resources, for type annotations. Reach them through a client, such as `client.voices`."""

from ._async.resources.account import AsyncAccount
from ._async.resources.agents import AsyncAgents
from ._async.resources.api_keys import AsyncApiKeys
from ._async.resources.chat import AsyncChat, AsyncCompletions
from ._async.resources.conversations import AsyncConversationMessages, AsyncConversations
from ._async.resources.embeddings import AsyncEmbeddings
from ._async.resources.knowledge_base import AsyncKnowledgeBase
from ._async.resources.models import AsyncModels
from ._async.resources.rerank import AsyncRerank
from ._async.resources.stt import AsyncStt
from ._async.resources.tools import AsyncTools
from ._async.resources.tts import AsyncTts, AsyncTtsJobs
from ._async.resources.voices import AsyncVoices
from ._async.resources.webhooks import AsyncWebhooks
from ._sync.resources.account import Account
from ._sync.resources.agents import Agents
from ._sync.resources.api_keys import ApiKeys
from ._sync.resources.chat import Chat, Completions
from ._sync.resources.conversations import ConversationMessages, Conversations
from ._sync.resources.embeddings import Embeddings
from ._sync.resources.knowledge_base import KnowledgeBase
from ._sync.resources.models import Models
from ._sync.resources.rerank import Rerank
from ._sync.resources.stt import Stt
from ._sync.resources.tools import Tools
from ._sync.resources.tts import Tts, TtsJobs
from ._sync.resources.voices import Voices
from ._sync.resources.webhooks import Webhooks

__all__ = [
    "Account",
    "Agents",
    "ApiKeys",
    "AsyncAccount",
    "AsyncAgents",
    "AsyncApiKeys",
    "AsyncChat",
    "AsyncCompletions",
    "AsyncConversationMessages",
    "AsyncConversations",
    "AsyncEmbeddings",
    "AsyncKnowledgeBase",
    "AsyncModels",
    "AsyncRerank",
    "AsyncStt",
    "AsyncTools",
    "AsyncTts",
    "AsyncTtsJobs",
    "AsyncVoices",
    "AsyncWebhooks",
    "Chat",
    "Completions",
    "ConversationMessages",
    "Conversations",
    "Embeddings",
    "KnowledgeBase",
    "Models",
    "Rerank",
    "Stt",
    "Tools",
    "Tts",
    "TtsJobs",
    "Voices",
    "Webhooks",
]
