# Written by scripts/unasync.py from src/naiuz/_async/resources/voices.py. Edit that file, then run the script.
"""Stock voices and your organization's voice clones."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..._request import NOT_GIVEN, APIRequest, NotGiven, RequestOptions, given
from ..._response import read_envelope, read_nothing
from ..._uploads import Form, Uploadable
from ...types.shared import SpeechLanguage
from ...types.voices import Voice, VoiceCategory, VoiceType
from .._io import Page, paginate, to_raw
from .._resource import APIResource


class Voices(APIResource):
    """Stock voices and your organization's voice clones."""

    @property
    def with_raw_response(self) -> VoicesWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return VoicesWithRawResponse(self)

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
    ) -> Page[Voice]:
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

    def retrieve(
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
        return self._http.request(request, read_envelope(Voice))

    def create(
        self,
        *,
        name: str,
        language: SpeechLanguage,
        ref_audio: Uploadable,
        ref_text: str | NotGiven | None = NOT_GIVEN,
        category: VoiceCategory | NotGiven = NOT_GIVEN,
        tags: Sequence[str] | NotGiven | None = NOT_GIVEN,
        idempotency_key: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Voice:
        """Clones a voice from a 10-15 second reference clip, sent as multipart/form-data, and returns the new voice:
        pass its `id` as `voice_id` when synthesizing.

        Every call sends an Idempotency-Key, `idempotency_key` or a generated one, the same on each retry: a replay of
        the key returns the voice it created, as it is now, instead of cloning another. When the voice service can't
        be reached or refuses the clip, it raises InternalServerError (502 `upstream_error`), and nothing is created.

        Args:
            name: The voice's name, up to 120 characters.
            language: The language the voice speaks.
            ref_audio: A 10-15 second reference clip: WAV, MP3, OGG or FLAC, at most 10 MB. A path, a
                `(filename, content)` or `(filename, content, content_type)` tuple, or a binary file object with a
                name: the filename's extension names the format.
            ref_text: What the clip says, up to 1000 characters. None sends nothing, as leaving it out does.
            category: What the voice is for.
            tags: Tags, up to 32 characters each, each sent as its own `tags[]` field. Blank tags are dropped.
            idempotency_key: Sent as the Idempotency-Key header, at most 191 characters. None or "" sends a
                generated UUIDv4.
        """
        options = RequestOptions(
            timeout=timeout, max_retries=max_retries, extra_headers=extra_headers, idempotency_key=idempotency_key
        )
        fields = given(
            name=name, language=language, ref_audio=ref_audio, ref_text=ref_text, category=category, tags=tags
        )
        form = Form(fields, files=("ref_audio",))
        request = APIRequest("POST", "/tts/voices", "idempotent", form=form, options=options)
        return self._http.request(request, read_envelope(Voice))

    def update(
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
        return self._http.request(request, read_envelope(Voice))

    def replace_audio(
        self,
        id: str,
        *,
        ref_audio: Uploadable,
        ref_text: str | NotGiven | None = NOT_GIVEN,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Voice:
        """Replaces a voice clone's reference clip, and optionally its transcript, sent as multipart/form-data. The
        clone keeps its id.

        Replacing always re-creates the voice, which can take several minutes: pass a longer `timeout` for it. A
        timeout is never retried here, because the voice may still be re-creating on the server. When the voice
        service fails, it raises InternalServerError (502 `upstream_error`), and its message says whether the old clip
        was kept.

        Args:
            ref_audio: The new reference clip, in the formats and size a new clone takes: WAV, MP3, OGG or FLAC, at
                most 10 MB. A path, a `(filename, content)` or `(filename, content, content_type)` tuple, or a binary
                file object with a name.
            ref_text: What the new clip says, up to 1000 characters. None sends nothing, as leaving it out does.
        """
        options = RequestOptions(timeout=timeout, max_retries=max_retries, extra_headers=extra_headers)
        form = Form(given(ref_audio=ref_audio, ref_text=ref_text), files=("ref_audio",))
        path = "/tts/voices/{id}/audio"
        request = APIRequest("POST", path, "recreate", path_params={"id": id}, form=form, options=options)
        return self._http.request(request, read_envelope(Voice))

    def delete(
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
        self._http.request(request, read_nothing)


class VoicesWithRawResponse:
    """The voices' methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, voices: Voices) -> None:
        self.list = to_raw(voices.list)
        self.retrieve = to_raw(voices.retrieve)
        self.create = to_raw(voices.create)
        self.update = to_raw(voices.update)
        self.replace_audio = to_raw(voices.replace_audio)
        self.delete = to_raw(voices.delete)
