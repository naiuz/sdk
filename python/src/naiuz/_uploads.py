"""Files to upload: the forms a caller may pass one in, and the multipart body a call's form becomes."""

from __future__ import annotations

import io
import json
import os
import re
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Protocol, TypeGuard, cast

from ._errors import NeuronAIError

CONTENT_TYPES = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "ogg": "audio/ogg",
    "flac": "audio/flac",
    "m4a": "audio/mp4",
    "webm": "audio/webm",
}
"""The content type each upload extension names, the same in every NeuronAI SDK."""

FileContent = bytes | IO[bytes]
"""A file's bytes, or a binary file object to read them from."""

Uploadable = str | os.PathLike[str] | tuple[str, FileContent] | tuple[str, FileContent, str] | IO[bytes]
"""A file to upload, with the filename to send it under: the filename's extension names its format.

- A path, as a `str` or a `Path`: the file is read, and sent under its own name.
- A `(filename, content)` tuple, where content is bytes or a binary file object.
- A `(filename, content, content_type)` tuple, to declare the content type yourself.
- A binary file object with a name, such as `open("clip.wav", "rb")`, sent under that name.

Bytes alone have no filename, so they go in a tuple: `("clip.wav", data)`. Unless a tuple gives one, the content type
comes from the extension: `wav` is `audio/wav`, `mp3` `audio/mpeg`, `ogg` `audio/ogg`, `flac` `audio/flac`, `m4a`
`audio/mp4`, `webm` `audio/webm`, and anything else `application/octet-stream`. The server checks a file by its content,
so the declared type never decides whether it is accepted.
"""

_FORMS = "a path, a (filename, content) or (filename, content, content_type) tuple, or a binary file object with a name"
_HEADER_TEXT = re.compile(r"[\t\x20-\x7e]*")


class _Readable(Protocol):
    def read(self) -> object: ...


@dataclass(frozen=True)
class FilePart:
    """A file ready to send: its filename, its bytes, and the content type to declare for it."""

    filename: str
    content: bytes
    content_type: str


@dataclass(frozen=True)
class Form:
    """A call's multipart body: its fields by name, and the names of those that are files."""

    fields: Mapping[str, object]
    files: tuple[str, ...]


def content_type_for(filename: str) -> str:
    """The content type a filename's extension names.

    The extension is what follows the last dot, in lower case. One the table doesn't hold, or none at all, gives
    `application/octet-stream`.
    """
    _, dot, extension = filename.rpartition(".")
    return CONTENT_TYPES.get(extension.lower(), "application/octet-stream") if dot else "application/octet-stream"


def read_upload(field: str, value: object) -> FilePart:
    """The file a caller passed as `field`, read whole, with the filename and content type to send it with.

    A path sends its last part as the filename, and a file object the last part of its name. A tuple's content type,
    when it is given and isn't empty, is declared as it is; otherwise the filename's extension picks one. A file object
    is read from its start when it can seek, as httpx reads one. Bytes alone, a file object without a name, an empty
    filename, and anything else that isn't one of the forms of Uploadable raise NeuronAIError, saying what to pass.
    """
    if isinstance(value, str | os.PathLike):
        path = os.fspath(cast("str | os.PathLike[str] | os.PathLike[bytes]", value))
        if isinstance(path, str):
            filename = _filename(field, os.path.basename(path))
            return FilePart(filename, _read_path(field, path), content_type_for(filename))
    elif isinstance(value, tuple):
        items = cast("tuple[object, ...]", value)
        given = items[0] if items else None
        declared = items[2] if len(items) == 3 else None
        if len(items) in (2, 3) and isinstance(given, str) and isinstance(declared, str | None):
            filename = _filename(field, given)
            content_type = _declared(field, declared) or content_type_for(filename)
            return FilePart(filename, _content(field, items[1]), content_type)
    elif isinstance(value, bytes | bytearray | memoryview):
        raise NeuronAIError(f'{field} needs a filename: pass ("clip.wav", data) rather than the bytes alone.')
    elif _is_file(value):
        name: object = getattr(value, "name", None)
        if not isinstance(name, str):
            raise NeuronAIError(f'{field} needs a filename: pass ("clip.wav", file) for a file object without a name.')
        filename = _filename(field, os.path.basename(name))
        return FilePart(filename, _read_file(field, value), content_type_for(filename))
    raise NeuronAIError(f"{field} must be {_FORMS}.")


def encode_form(form: Form, boundary: str | None = None) -> tuple[bytes, str]:
    """The multipart body of a call's form, and its content type, which names the boundary.

    Each field named in `form.files` goes as a file part, read here, once (read_upload). A list goes as one `name[]`
    part per item, and any other field as text: a string as it is, and any other value as JSON, such as `2` or `true`.
    A None field is left out, and an empty list sends no part. In names and filenames, `"`, CR and LF go as `%22`,
    `%0D` and `%0A`, as browsers send them. The boundary is random, unless a test gives one.
    """
    boundary = uuid.uuid4().hex if boundary is None else boundary
    body = bytearray()
    for name, value in form.fields.items():
        if value is None:
            continue
        if name in form.files:
            file = read_upload(name, value)
            disposition = f'name="{_escape(name)}"; filename="{_escape(file.filename)}"'
            body += _head(boundary, disposition, f"Content-Type: {file.content_type}\r\n") + file.content + b"\r\n"
        elif isinstance(value, list | tuple):
            for item in cast("Sequence[object]", value):
                body += _text(boundary, f"{name}[]", item)
        else:
            body += _text(boundary, name, value)
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def _filename(field: str, filename: str) -> str:
    if filename == "":
        raise NeuronAIError(f'{field} needs a filename, such as "clip.wav".')
    return filename


def _declared(field: str, content_type: str | None) -> str | None:
    """A content type the caller declared, checked: a header must be able to carry it."""
    if content_type is not None and not _HEADER_TEXT.fullmatch(content_type):
        raise NeuronAIError(f"{field}'s content type has a character a header can't carry.")
    return content_type


def _is_file(value: object) -> TypeGuard[_Readable]:
    return callable(getattr(value, "read", None))


def _content(field: str, content: object) -> bytes:
    """A tuple's content: its bytes, or what its binary file object holds."""
    if isinstance(content, bytes | bytearray):
        return bytes(content)
    if _is_file(content):
        return _read_file(field, content)
    raise NeuronAIError(f"{field}'s content must be bytes or a binary file object.")


def _read_path(field: str, path: str) -> bytes:
    try:
        return Path(path).read_bytes()
    except OSError as error:
        reason = error.strerror or str(error)
        raise NeuronAIError(f"{field} couldn't be read from {path}: {reason}") from error


def _read_file(field: str, file: _Readable) -> bytes:
    if isinstance(file, io.TextIOBase):
        raise NeuronAIError(f'{field} must be opened in binary mode, such as open(path, "rb").')
    try:
        seekable = getattr(file, "seekable", None)
        if callable(seekable) and seekable():
            cast("IO[bytes]", file).seek(0)
        data = file.read()
    except OSError as error:
        raise NeuronAIError(f"{field} couldn't be read: {error.strerror or error}") from error
    if not isinstance(data, bytes | bytearray):
        raise NeuronAIError(f"{field}'s content must be bytes or a binary file object.")
    return bytes(data)


def _escape(text: str) -> str:
    return text.replace('"', "%22").replace("\r", "%0D").replace("\n", "%0A")


def _head(boundary: str, disposition: str, headers: str = "") -> bytes:
    return f"--{boundary}\r\nContent-Disposition: form-data; {disposition}\r\n{headers}\r\n".encode()


def _text(boundary: str, name: str, value: object) -> bytes:
    text = value if isinstance(value, str) else json.dumps(value)
    return _head(boundary, f'name="{_escape(name)}"') + text.encode() + b"\r\n"
