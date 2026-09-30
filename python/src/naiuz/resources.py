"""The client's resources, for type annotations. Reach them through a client, such as `client.voices`."""

from ._async.resources.account import AsyncAccount
from ._async.resources.tts import AsyncTts, AsyncTtsJobs
from ._async.resources.voices import AsyncVoices
from ._sync.resources.account import Account
from ._sync.resources.tts import Tts, TtsJobs
from ._sync.resources.voices import Voices

__all__ = ["Account", "AsyncAccount", "AsyncTts", "AsyncTtsJobs", "AsyncVoices", "Tts", "TtsJobs", "Voices"]
