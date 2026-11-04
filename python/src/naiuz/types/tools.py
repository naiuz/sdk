"""The tools agents can use."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypedDict

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
    """For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a
    `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`,
    `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`:
    `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1
    to 120. A `client` tool can send `{}`. Secrets appear by id.
    """


class _SaveToolFields(TypedDict):
    kind: str
    """A `webhook` our servers call, or a `client` tool your page runs."""
    name: str
    """Its name: small letters, digits and `_`."""
    description: str
    """What it does and when to use it, for the model to read."""
    config: Mapping[str, object]
    """For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each parameter a
    `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`), and its `type`,
    `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5 to 120. For `client`:
    `parameters`, a list of `name`, `type`, `required` and `description`, with `wait_for_result` and `timeout_s`, from 1
    to 120. A `client` tool can send `{}`.
    """


class SaveToolRequest(_SaveToolFields, total=False):
    """What `tools.create` takes, each as a keyword argument."""

    last_test_status: str | None
    """The result of a test this config passed."""
