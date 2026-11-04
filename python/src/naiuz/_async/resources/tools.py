"""The tools agents can use."""

from __future__ import annotations

from collections.abc import Mapping

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope, read_nothing
from ...types.tools import Tool
from .._io import AsyncPaginator, paginate, to_raw
from .._resource import AsyncAPIResource


class AsyncTools(AsyncAPIResource):
    """The tools agents can use."""

    @property
    def with_raw_response(self) -> AsyncToolsWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AsyncToolsWithRawResponse(self)

    def list(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> AsyncPaginator[Tool]:
        """Your organization's tools."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        return paginate(self._http, APIRequest("GET", "/tools", "safe", options=options), Tool)

    async def retrieve(
        self,
        tool: str | int,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Tool:
        """One tool, with its config.

        Secrets appear by id, never by value.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/tools/{tool}", "safe", path_params={"tool": str(tool)}, options=options)
        return await self._http.request(request, read_envelope(Tool))

    async def create(
        self,
        *,
        kind: str,
        name: str,
        description: str,
        config: Mapping[str, object],
        last_test_status: str | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Tool:
        """Creates a webhook tool, which calls your systems, or a client tool, which runs in your page.

        Args:
            kind: A `webhook` our servers call, or a `client` tool your page runs.
            name: Its name: small letters, digits and `_`.
            description: What it does and when to use it, for the model to read.
            config: For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each
                parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`),
                and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5
                to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with
                `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`.
            last_test_status: The result of a test this config passed.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(kind=kind, name=name, description=description, config=config, last_test_status=last_test_status)
        request = APIRequest("POST", "/tools", "once", body=body, options=options)
        return await self._http.request(request, read_envelope(Tool))

    async def update(
        self,
        tool: str | int,
        *,
        kind: str,
        name: str,
        description: str,
        config: Mapping[str, object],
        last_test_status: str | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Tool:
        """Replaces a tool.

        Agents that use it get the change when it's saved.

        Args:
            kind: A `webhook` our servers call, or a `client` tool your page runs.
            name: Its name.
            description: What it does and when to use it.
            config: For `webhook`: `method` and `url`, with `parameters` holding `path`, `query` and `body` lists, each
                parameter a `name`, a `source` (`model` for what the agent fills in, `fixed`, `variable` or `secret`),
                and its `type`, `required` and `description`. Also `headers`, `auth`, `response` and `timeout_s`, from 5
                to 120. For `client`: `parameters`, a list of `name`, `type`, `required` and `description`, with
                `wait_for_result` and `timeout_s`, from 1 to 120. A `client` tool can send `{}`.
            last_test_status: The result of a test this config passed.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(kind=kind, name=name, description=description, config=config, last_test_status=last_test_status)
        request = APIRequest(
            "PUT", "/tools/{tool}", "safe", path_params={"tool": str(tool)}, body=body, options=options
        )
        return await self._http.request(request, read_envelope(Tool))

    async def delete(
        self,
        tool: str | int,
        *,
        detach: bool | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        """Deletes a tool.

        Args:
            detach: Take it off the agents that use it. Without this, one in use raises a conflict naming them.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query = {"detach": detach}
        request = APIRequest(
            "DELETE", "/tools/{tool}", "safe", path_params={"tool": str(tool)}, query=query, options=options
        )
        await self._http.request(request, read_nothing)


class AsyncToolsWithRawResponse:
    """Tools: these methods, each returning a RawResponse: the result with its status and headers."""

    def __init__(self, tools: AsyncTools) -> None:
        self.list = to_raw(tools.list)
        self.retrieve = to_raw(tools.retrieve)
        self.create = to_raw(tools.create)
        self.update = to_raw(tools.update)
        self.delete = to_raw(tools.delete)
