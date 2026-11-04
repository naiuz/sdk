"""The tools agents can use."""

from __future__ import annotations

from typing import Any

from .._models import BaseModel, WithRequestId


class ToolUser(BaseModel):
    """An agent that uses a tool."""

    id: str
    """The agent's id."""
    name: str
    """The agent's name."""
    published: bool
    """Whether its live version uses it."""


class Tool(WithRequestId):
    """A tool agents can use. `config` comes with `retrieve`, `create` and `update`."""

    id: int
    """The tool's id."""
    kind: str
    """`webhook` or `client`, or a kind the platform manages."""
    name: str
    """Its name."""
    description: str
    """What it does and when to use it."""
    target: str | None
    """What it calls."""
    last_test_at: str | None
    """When it was last tested."""
    last_test_status: str | None
    """How the last test went."""
    used_by: list[ToolUser]
    """The agents that use it."""
    wait_for_result: bool | None
    """Whether a client tool's result is waited for."""
    timeout_s: int | None
    """How long a client tool has, in seconds."""
    config: dict[str, Any] | None = None
    """What it calls, with its parameters. Secrets appear by id."""
