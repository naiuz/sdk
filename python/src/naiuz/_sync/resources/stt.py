# Written by scripts/unasync.py from src/naiuz/_async/resources/stt.py. Edit that file, then run the script.
"""Speech to text."""

from __future__ import annotations

from collections.abc import Mapping

from ..._request import APIRequest, RequestOptions
from ..._response import read_envelope
from ..._uploads import Form, Uploadable
from ...types.stt import Transcription, TranscriptionLanguage
from .._io import to_raw
from .._resource import APIResource


class Stt(APIResource):
    """Speech to text."""

    @property
    def with_raw_response(self) -> SttWithRawResponse:
        """These methods, each returning a RawResponse: the result with its answer's status and headers."""
        return SttWithRawResponse(self)

    def transcribe(
        self,
        *,
        file: Uploadable,
        language: TranscriptionLanguage,
        idempotency_key: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Transcription:
        """Transcribes an audio file, sent as multipart/form-data: the text, the language, the duration, timed
        segments, the price and your balance after the charge.

        It is billed by duration at the per-minute rate, settled on the actual duration. Every call sends an
        Idempotency-Key, `idempotency_key` or a generated one, the same on each retry, so a retry never charges twice.
        A transcription's key is kept indefinitely: reuse one only for the same file.

        Args:
            file: The audio: MP3, WAV, OGG, FLAC, M4A or WebM, at most 25 MB. A path, a `(filename, content)` or
                `(filename, content, content_type)` tuple, or a binary file object with a name: the filename's
                extension names the format.
            language: The language spoken in it.
            idempotency_key: Sent as the Idempotency-Key header, at most 191 characters. None or "" sends a
                generated UUIDv4.
        """
        options = RequestOptions(
            timeout=timeout, max_retries=max_retries, extra_headers=extra_headers, idempotency_key=idempotency_key
        )
        form = Form({"file": file, "language": language}, files=("file",))
        request = APIRequest("POST", "/stt/transcribe", "idempotent", form=form, options=options)
        return self._http.request(request, read_envelope(Transcription))


class SttWithRawResponse:
    """Speech to text's methods, each returning a RawResponse: the result with its answer's status and headers."""

    def __init__(self, stt: Stt) -> None:
        self.transcribe = to_raw(stt.transcribe)
