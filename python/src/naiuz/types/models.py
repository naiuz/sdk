"""The chat models available to your account."""

from __future__ import annotations

from typing import Literal

from .._models import BaseModel, WithCost


class Model(BaseModel):
    """A chat model. Send its `id` as `model`."""

    id: str
    """The model's id."""
    object: Literal["model"] | str
    """Always `model`."""
    created: int
    """When the model was added, in Unix seconds."""
    owned_by: str
    """Who serves the model."""


class ModelList(WithCost):
    """The chat models, in OpenAI's list shape."""

    object: Literal["list"] | str
    """Always `list`."""
    data: list[Model]
    """The models."""
