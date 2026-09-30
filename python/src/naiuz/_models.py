"""The base of every object the API returns."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast

import pydantic
from pydantic import ConfigDict, PrivateAttr, SerializerFunctionWrapHandler, model_serializer

REQUEST_ID = "naiuz.request_id"
"""The validation context's key for the request ID a `{data, request_id}` answer's object carries."""

COST = "naiuz.cost"
"""The validation context's key for the price a compatible endpoint's answer carries."""


def _from_context(context: object, key: str) -> object:
    """What the validation context holds under `key`, or None."""
    return cast("Mapping[str, object]", context).get(key) if isinstance(context, Mapping) else None


class BaseModel(pydantic.BaseModel):
    """The base of every object the API returns.

    It keeps a field the SDK doesn't know yet, so a field the API adds later still arrives. It dumps and compares
    exactly as the API sent it: `model_dump()` and `model_dump_json()` give the fields the answer held, a null as
    null, and nothing the SDK filled in or attached.
    """

    model_config = ConfigDict(extra="allow")

    @model_serializer(mode="wrap")
    def _as_sent(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        dumped: dict[str, Any] = handler(self)
        return {name: value for name, value in dumped.items() if name in self.model_fields_set}

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, pydantic.BaseModel):
            return NotImplemented
        return type(self) is type(other) and self.model_dump() == other.model_dump()


class WithRequestId(BaseModel):
    """An object the API sent in its `{data, request_id}` envelope, with the request's ID attached."""

    _request_id: str | None = PrivateAttr(default=None)

    def model_post_init(self, context: Any, /) -> None:
        request_id = _from_context(context, REQUEST_ID)
        self._request_id = request_id if isinstance(request_id, str) else None

    @property
    def request_id(self) -> str | None:
        """The request's ID, to quote to support: the answer's `request_id`, else its `X-Request-Id` header.

        None inside a page, or on an object you build yourself. It isn't a field: `model_dump()` leaves it out, and
        it doesn't count when objects are compared.
        """
        return self._request_id


class WithCost(BaseModel):
    """A compatible endpoint's answer, with its price attached from the `X-Cost` header."""

    _cost: float | None = PrivateAttr(default=None)

    def model_post_init(self, context: Any, /) -> None:
        cost = _from_context(context, COST)
        self._cost = cost if isinstance(cost, float) else None

    @property
    def cost(self) -> float | None:
        """The price billed, in UZS, from the `X-Cost` header; None when the answer has none.

        It isn't a field: `model_dump()` leaves it out, and it doesn't count when objects are compared.
        """
        return self._cost
