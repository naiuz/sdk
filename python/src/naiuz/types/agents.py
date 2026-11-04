"""Your organization's agents."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypedDict

from .._models import BaseModel, WithRequestId


class AgentChannel(BaseModel):
    """A channel an agent answers on."""

    id: int
    """The channel's id."""
    type: str
    """`telegram`, `instagram`, `facebook`, `widget` or `voice`."""
    name: str
    """The channel's name."""


class Agent(WithRequestId):
    """An agent. `revision` and `config` come with `retrieve`."""

    id: str
    """The agent's id, `agent_…`."""
    name: str
    """The agent's name."""
    state: str
    """`draft`, `published` or `paused`."""
    live_version: int | None
    """The version customers meet, or `null` before the first publish."""
    has_unpublished_changes: bool
    """Whether the draft says something the live version doesn't."""
    languages: list[str]
    """The draft's languages, the main one first."""
    last_published_at: str | None
    """When it was last published."""
    channels: list[AgentChannel]
    """Where it answers."""
    revision: int | None = None
    """The draft's revision, to change it from."""
    config: dict[str, Any] | None = None
    """The draft: its prompt, languages, tools and the rest."""


class CreatedAgent(WithRequestId):
    """A new agent."""

    id: str
    """The agent's id, `agent_…`."""
    personalized: bool
    """Whether the model fitted the prompt to your answers. `false` keeps the template's prompt."""


class AgentDraftSaved(WithRequestId):
    """A saved draft."""

    revision: int
    """The draft's new revision."""
    saved_at: str
    """When it was saved."""
    has_unpublished_changes: bool
    """Whether the draft says something the live version doesn't."""


class AgentStatus(WithRequestId):
    """An agent after publishing."""

    state: str
    """`draft`, `published` or `paused`."""
    live_version: int | None
    """The version customers meet."""
    revision: int
    """The draft's revision."""
    has_unpublished_changes: bool
    """Whether the draft says something the live version doesn't."""


class AgentSignedUrl(WithRequestId):
    """A link a page opens a conversation with."""

    signed_url: str
    """The link, for the page's `signedUrl`. It works once."""
    expires_at: str
    """When it stops working, 15 minutes on."""


class _CreateAgentFields(TypedDict):
    template: str
    """The template to start from: `support`, `sales`, or `blank`, which asks nothing."""
    language: str
    """The agent's main language: `uz`, `ru` or `en`."""


class CreateAgentRequest(_CreateAgentFields, total=False):
    """What `agents.create` takes, each as a keyword argument."""

    name: str | None
    """The agent's name. The template's when left out."""
    answers: Mapping[str, object]
    """The answers to the template's questions, by question. `support` and `sales` need `business_name`, `offering`,
    `goal` and `tone`, and `blank` needs none. The Agents page of the docs lists what each one takes.
    """


class UpdateAgentRequest(TypedDict):
    """What `agents.update` takes, each as a keyword argument."""

    base_revision: int
    """The `revision` you read."""
    sections: Mapping[str, object]
    """The top-level sections of the config to replace, such as `prompt`."""


class _PublishAgentFields(TypedDict):
    base_revision: int
    """The `revision` you read."""


class PublishAgentRequest(_PublishAgentFields, total=False):
    """What `agents.publish` takes, each as a keyword argument."""

    note: str | None
    """What changed, for the version history. Up to 140 characters."""
