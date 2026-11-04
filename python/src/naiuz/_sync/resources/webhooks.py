# Written by scripts/unasync.py from src/naiuz/_async/resources/webhooks.py. Edit that file, then run the script.
"""The addresses that hear of what agents and operators say."""

from __future__ import annotations

import hashlib
import hmac
import time
from collections.abc import Mapping, Sequence

from ..._errors import WebhookVerificationError
from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope, read_nothing
from ...types.webhooks import CreatedWebhookEndpoint, WebhookEndpoint, WebhookEvent
from .._io import Page, paginate, to_raw
from .._resource import APIResource


class Webhooks(APIResource):
    """The addresses that hear of what agents and operators say."""

    @property
    def with_raw_response(self) -> WebhooksWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return WebhooksWithRawResponse(self)

    def list(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Page[WebhookEndpoint]:
        """Your organization's endpoints.

        A signing secret never appears here.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        return paginate(self._http, APIRequest("GET", "/webhooks", "safe", options=options), WebhookEndpoint)

    def retrieve(
        self,
        endpoint: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> WebhookEndpoint:
        """One endpoint, and how its last delivery went."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/webhooks/{endpoint}", "safe", path_params={"endpoint": endpoint}, options=options)
        return self._http.request(request, read_envelope(WebhookEndpoint))

    def create(
        self,
        *,
        url: str,
        events: Sequence[str],
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> CreatedWebhookEndpoint:
        """Adds an address to send events to, and returns its signing `secret`:

        the only time it's shown, so store it now. For owners and admins.

        Args:
            url: A public https address.
            events: `conversation.message.created` and `conversation.ended`.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(url=url, events=events)
        request = APIRequest("POST", "/webhooks", "once", body=body, options=options)
        return self._http.request(request, read_envelope(CreatedWebhookEndpoint))

    def update(
        self,
        endpoint: str,
        *,
        url: str | NotGiven = NOT_GIVEN,
        events: Sequence[str] | NotGiven = NOT_GIVEN,
        enabled: bool | NotGiven = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> WebhookEndpoint:
        """Changes the address or the events, or turns it off and on.

        Only what you pass is sent.

        Args:
            url: A public https address.
            events: What it hears of.
            enabled: On or off. Turning it on sends what was waiting.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(url=url, events=events, enabled=enabled)
        request = APIRequest(
            "PATCH", "/webhooks/{endpoint}", "safe", path_params={"endpoint": endpoint}, body=body, options=options
        )
        return self._http.request(request, read_envelope(WebhookEndpoint))

    def delete(
        self,
        endpoint: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        """Deletes an endpoint, with its deliveries."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest(
            "DELETE", "/webhooks/{endpoint}", "safe", path_params={"endpoint": endpoint}, options=options
        )
        self._http.request(request, read_nothing)

    def verify(
        self,
        body: str | bytes,
        signature: str | None,
        secret: str,
        *,
        tolerance_seconds: float = 300,
        now: float | None = None,
    ) -> WebhookEvent:
        """Checks a webhook's `X-NeuronAI-Signature` header against the body as it arrived, and returns the event.

        Anything wrong raises WebhookVerificationError: answer 400 and do nothing with the body. A signature older than
        `tolerance_seconds` is refused, so a recorded delivery can't be played back later.

        Args:
            body: The body as it arrived, before it's parsed.
            signature: The `X-NeuronAI-Signature` header.
            secret: The endpoint's signing secret.
            tolerance_seconds: How old a signature may be.
            now: The time to check it against, in seconds since the epoch. Now by default.
        """
        raw = body.encode() if isinstance(body, str) else body
        parts = [part.strip().split("=", 1) for part in (signature or "").split(",")]
        timestamp = next((part[1] for part in parts if len(part) == 2 and part[0] == "t"), "")
        candidates = [part[1] for part in parts if len(part) == 2 and part[0] == "v1"]
        if not (timestamp.isascii() and timestamp.isdigit()) or not candidates:
            raise WebhookVerificationError("The signature header isn't one we send.")
        if abs((time.time() if now is None else now) - int(timestamp)) > tolerance_seconds:
            raise WebhookVerificationError("The signature is too old, or from the future.")
        expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in candidates):
            raise WebhookVerificationError("The signature doesn't match the body.")
        return WebhookEvent.model_validate_json(raw)


class WebhooksWithRawResponse:
    """Webhooks: these methods, each returning a RawResponse: the result with its status and headers."""

    def __init__(self, webhooks: Webhooks) -> None:
        self.list = to_raw(webhooks.list)
        self.retrieve = to_raw(webhooks.retrieve)
        self.create = to_raw(webhooks.create)
        self.update = to_raw(webhooks.update)
        self.delete = to_raw(webhooks.delete)
