"""The addresses that hear of what agents and operators say."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, TypedDict

from .._models import BaseModel, WithRequestId


class WebhookEvent(BaseModel):
    """An event a webhook brought, once its signature is checked."""

    id: str
    """The event's id, the same on a retry or a Resend: use it to drop repeats."""
    type: str
    """`conversation.message.created` or `conversation.ended`, or an event added later."""
    created_at: str
    """When it happened (ISO 8601). A retry can arrive after a newer event, so sort by this."""
    data: dict[str, Any]
    """What happened."""


class WebhookLastDelivery(BaseModel):
    """How an endpoint's last delivery went."""

    status: str
    """`pending`, `delivered` or `failed`."""
    status_code: int | None
    """The HTTP status the receiver answered."""
    at: str
    """When it was tried."""


class WebhookEndpoint(WithRequestId):
    """An address that hears of events. Its secret is never here."""

    id: str
    """The endpoint's id, `whe_…`."""
    url: str
    """The address."""
    host: str
    """The address's host."""
    events: list[str]
    """What it hears of."""
    status: str
    """`active`, `disabled`, or `failing` once failures have turned it off."""
    failing_because: str | None
    """`three_events` or `one_day` while it's `failing`."""
    last_delivery: WebhookLastDelivery | None
    """How the last delivery went."""
    created_at: str
    """When it was added."""


class CreatedWebhookEndpoint(WithRequestId):
    """A new endpoint, with its signing secret."""

    endpoint: WebhookEndpoint
    """The endpoint."""
    secret: str
    """The signing secret: the only time it's shown, so store it now."""


class CreateWebhookEndpointRequest(TypedDict):
    """What `webhooks.create` takes, each as a keyword argument."""

    url: str
    """A public https address."""
    events: Sequence[str]
    """`conversation.message.created` and `conversation.ended`."""


class UpdateWebhookEndpointRequest(TypedDict, total=False):
    """What `webhooks.update` takes, each as a keyword argument."""

    url: str
    """A public https address."""
    events: Sequence[str]
    """What it hears of."""
    enabled: bool
    """On or off. Turning it on sends what was waiting."""
