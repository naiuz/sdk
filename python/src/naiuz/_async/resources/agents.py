"""Your organization's agents."""

from __future__ import annotations

from collections.abc import Mapping

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope
from ...types.agents import Agent, AgentDraftSaved, AgentSignedUrl, AgentStatus, CreatedAgent
from .._io import AsyncPaginator, paginate, to_raw
from .._resource import AsyncAPIResource


class AsyncAgents(AsyncAPIResource):
    """Your organization's agents."""

    @property
    def with_raw_response(self) -> AsyncAgentsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AsyncAgentsWithRawResponse(self)

    def list(
        self,
        *,
        search: str | None = None,
        status: str | None = None,
        limit: int | None = None,
        cursor: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> AsyncPaginator[Agent]:
        """Your organization's agents, the ones changed last first.

        Loop over the result for every agent, each page fetched when the loop reaches it.

        Args:
            search: Part of the agent's name.
            status: `draft`, `published` or `paused`.
            limit: How many, from 1 to 100 (50 when left out).
            cursor: A page's `next_cursor`, to start from the page after it.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query = {"search": search, "status": status, "limit": limit, "cursor": cursor}
        return paginate(self._http, APIRequest("GET", "/agents", "safe", query=query, options=options), Agent)

    async def retrieve(
        self,
        agent: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Agent:
        """An agent, with its draft as `config` and the `revision` to change it from."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/agents/{agent}", "safe", path_params={"agent": agent}, options=options)
        return await self._http.request(request, read_envelope(Agent))

    async def create(
        self,
        *,
        template: str,
        language: str,
        name: str | NotGiven | None = NOT_GIVEN,
        answers: Mapping[str, object] | NotGiven = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> CreatedAgent:
        """Creates an agent from a template.

        The model fits its prompt to your answers, and `personalized` says when it couldn't.

        Args:
            template: The template: `support` or `sales`.
            language: The agent's main language: `uz`, `ru` or `en`.
            name: The agent's name. The template's when left out.
            answers: The answers to the template's questions, by question.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(template=template, language=language, name=name, answers=answers)
        request = APIRequest("POST", "/agents", "once", body=body, options=options)
        return await self._http.request(request, read_envelope(CreatedAgent))

    async def update(
        self,
        agent: str,
        *,
        base_revision: int,
        sections: Mapping[str, object],
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> AgentDraftSaved:
        """Replaces whole sections of the draft.

        Someone else's change since you read it raises a conflict: read the agent again. Customers see nothing of
        this until you publish.

        Args:
            base_revision: The `revision` you read.
            sections: The top-level sections of the config to replace, such as `prompt`.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(base_revision=base_revision, sections=sections)
        request = APIRequest(
            "PATCH", "/agents/{agent}", "once", path_params={"agent": agent}, body=body, options=options
        )
        return await self._http.request(request, read_envelope(AgentDraftSaved))

    async def publish(
        self,
        agent: str,
        *,
        base_revision: int,
        note: str | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> AgentStatus:
        """Makes the draft live as a new version.

        What stands in the way is an error with `fields`, naming each part of the config.

        Args:
            base_revision: The `revision` you read.
            note: What changed, for the version history. Up to 140 characters.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(base_revision=base_revision, note=note)
        request = APIRequest(
            "POST", "/agents/{agent}/publish", "once", path_params={"agent": agent}, body=body, options=options
        )
        return await self._http.request(request, read_envelope(AgentStatus))

    async def signed_url(
        self,
        agent: str,
        *,
        vars: Mapping[str, str | int | float | bool] | None = None,
        customer_id: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> AgentSignedUrl:
        """A link your page opens a conversation with, for a private agent or to bind a conversation to a customer of
        yours.

        It must be used within 15 minutes, once. Make it on your server.

        Args:
            vars: Values for the agent's `{{variables}}` that the page can't change. They travel in the link, so
                they're not secret.
            customer_id: Your own id for this customer. Their conversations then share one contact.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query: dict[str, str | int | float | bool | None] = {"customer_id": customer_id}
        query.update({f"vars[{name}]": value for name, value in (vars or {}).items()})
        request = APIRequest(
            "GET", "/agents/{agent}/signed-url", "safe", path_params={"agent": agent}, query=query, options=options
        )
        return await self._http.request(request, read_envelope(AgentSignedUrl))


class AsyncAgentsWithRawResponse:
    """Agents: these methods, each returning a RawResponse: the result with its status and headers."""

    def __init__(self, agents: AsyncAgents) -> None:
        self.list = to_raw(agents.list)
        self.retrieve = to_raw(agents.retrieve)
        self.create = to_raw(agents.create)
        self.update = to_raw(agents.update)
        self.publish = to_raw(agents.publish)
        self.signed_url = to_raw(agents.signed_url)
