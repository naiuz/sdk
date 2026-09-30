"""Stock voices and your organization's voice clones."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope, read_nothing
from ...types.shared import SpeechLanguage
from ...types.voices import Voice, VoiceCategory, VoiceType
from .._io import AsyncPaginator, paginate, to_raw
from .._resource import AsyncAPIResource


class AsyncVoices(AsyncAPIResource):
    """Stock voices and your organization's voice clones."""

    @property
    def with_raw_response(self) -> AsyncVoicesWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return AsyncVoicesWithRawResponse(self)

    def list(
        self,
        *,
        type: VoiceType | None = None,
        language: str | None = None,
        limit: int | None = None,
        cursor: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> AsyncPaginator[Voice]:
        """Stock voices first, in their catalog order, then your organization's ready clones, newest first.

        Loop over the result for every voice, each page fetched when the loop reaches it.

        Args:
            type: `stock` or `custom` narrows the list to that type.
            language: Only voices in this language, such as `uz`.
            limit: Voices per page, from 1 to 100 (50 when left out).
            cursor: A page's `next_cursor`, to start from the page after it. Cursors are opaque: don't build them.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        query = {"type": type, "language": language, "limit": limit, "cursor": cursor}
        return paginate(self._http, APIRequest("GET", "/tts/voices", "safe", query=query, options=options), Voice)

    async def retrieve(
        self,
        id: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Voice:
        """One voice by id. Stock voices are public; a clone of another organization raises NotFoundError."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("GET", "/tts/voices/{id}", "safe", path_params={"id": id}, options=options)
        return await self._http.request(request, read_envelope(Voice))

    async def update(
        self,
        id: str,
        *,
        name: str | NotGiven = NOT_GIVEN,
        category: VoiceCategory | NotGiven = NOT_GIVEN,
        language: SpeechLanguage | NotGiven = NOT_GIVEN,
        ref_text: str | NotGiven | None = NOT_GIVEN,
        tags: Sequence[str] | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Voice:
        """Changes a voice clone's name, category, language, transcript or tags. The clone keeps its id.

        Only the fields you pass are sent. Changing the language or the transcript re-creates the voice, which can
        take several minutes: pass a longer `timeout` for it. A timeout is never retried here, because the voice may
        still be re-creating on the server.

        Args:
            name: The new name, up to 120 characters.
            category: The new category.
            language: The new language. Changing it re-creates the voice.
            ref_text: The new transcript, up to 1000 characters. None or "" clears it. Changing it re-creates the
                voice.
            tags: The new tags, up to 32 characters each. None or [] clears them, and blank tags are dropped.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        body = given(name=name, category=category, language=language, ref_text=ref_text, tags=tags)
        request = APIRequest(
            "PATCH", "/tts/voices/{id}", "recreate", path_params={"id": id}, body=body, options=options
        )
        return await self._http.request(request, read_envelope(Voice))

    async def delete(
        self,
        id: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        """Deletes a voice clone for good. A stock voice can't be deleted: like an unknown id, it raises
        NotFoundError."""
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        request = APIRequest("DELETE", "/tts/voices/{id}", "safe", path_params={"id": id}, options=options)
        await self._http.request(request, read_nothing)


class AsyncVoicesWithRawResponse:
    """The voices' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, voices: AsyncVoices) -> None:
        self.list = to_raw(voices.list)
        self.retrieve = to_raw(voices.retrieve)
        self.update = to_raw(voices.update)
        self.delete = to_raw(voices.delete)
