"""The client's resources, for type annotations. Reach them through a client, such as `client.account`."""

from ._async.resources.account import AsyncAccount
from ._sync.resources.account import Account

__all__ = ["Account", "AsyncAccount"]
