"""Your organization's balance and usage."""

from __future__ import annotations

from typing import Literal

from .._models import BaseModel, WithRequestId


class Balance(WithRequestId):
    """The organization's remaining credit, and its prices."""

    balance: float
    """The remaining credit, in `currency`."""
    formatted: str
    """The balance written for people, such as `10 000 UZS`."""
    currency: str
    """The currency, such as `UZS`."""
    stt_price_per_minute: float
    """The price of one minute of transcription, in `currency`."""
    tts_price_per_char: float
    """The price of one character of speech, in `currency`."""
    min_topup: float
    """The smallest top-up, in `currency`."""


class UsagePeriod(BaseModel):
    """The counted window: whole days, today included."""

    days: int
    """How many days were counted."""
    start: str
    """The first day counted (`YYYY-MM-DD`)."""
    end: str
    """The last day counted (`YYYY-MM-DD`): today."""


class UsageTotal(BaseModel):
    """The whole window's requests and spend."""

    requests: int
    """The requests made."""
    cost: float
    """The spend, in UZS."""
    formatted_cost: str
    """The spend written for people, such as `1 250,50 UZS`."""
    currency: Literal["UZS"] | str
    """Always `UZS`."""


class UsageByService(BaseModel):
    """One service's requests and spend in the window."""

    service: str
    """The service's code, such as `llm`."""
    label: str
    """The service's name."""
    requests: int
    """The requests made."""
    cost: float
    """The spend, in UZS."""


class UsageByKey(BaseModel):
    """One API key's requests and spend in the window."""

    id: str | None
    """The key's `id`, as the API keys endpoints show it, or None for requests made from the dashboard."""
    name: str
    """The key's name."""
    requests: int
    """The requests made."""
    cost: float
    """The spend, in UZS."""


class Usage(WithRequestId):
    """Spend and request counts over the last `days`, grouped by service and by API key."""

    period: UsagePeriod
    """The counted window: whole days, today included."""
    total: UsageTotal
    """The whole window's requests and spend."""
    by_service: list[UsageByService]
    """One row per service used in the window, the costliest first."""
    by_key: list[UsageByKey]
    """One row per API key used in the window, the costliest first."""
