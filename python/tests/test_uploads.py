import io
from pathlib import Path

import pytest

from naiuz import NeuronAIError
from naiuz._uploads import FilePart, Form, content_type_for, encode_form, read_upload

WAV = b"RIFF\x24\x00\x00\x00WAVEfmt "


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("clip.wav", "audio/wav"),
        ("clip.mp3", "audio/mpeg"),
        ("clip.ogg", "audio/ogg"),
        ("clip.flac", "audio/flac"),
        ("clip.m4a", "audio/mp4"),
        ("clip.webm", "audio/webm"),
        ("CLIP.WAV", "audio/wav"),
        ("take.2.mp3", "audio/mpeg"),
        ("notes.txt", "application/octet-stream"),
        ("clip", "application/octet-stream"),
        ("clip.", "application/octet-stream"),
    ],
)
def test_the_content_type_comes_from_what_follows_the_last_dot(filename: str, content_type: str) -> None:
    assert content_type_for(filename) == content_type


def test_a_path_is_read_and_sent_under_its_own_name(tmp_path: Path) -> None:
    path = tmp_path / "sample.wav"
    path.write_bytes(WAV)
    assert read_upload("ref_audio", path) == FilePart("sample.wav", WAV, "audio/wav")
    assert read_upload("ref_audio", str(path)) == FilePart("sample.wav", WAV, "audio/wav")


def test_a_tuple_sends_its_bytes_or_its_file_object_under_its_filename() -> None:
    assert read_upload("file", ("clip.mp3", WAV)) == FilePart("clip.mp3", WAV, "audio/mpeg")
    assert read_upload("file", ("clip.mp3", io.BytesIO(WAV))) == FilePart("clip.mp3", WAV, "audio/mpeg")


def test_a_tuple_s_content_type_wins_over_the_extension_s_unless_it_is_empty() -> None:
    assert read_upload("file", ("clip.mp3", WAV, "audio/wav")).content_type == "audio/wav"
    assert read_upload("file", ("clip.mp3", WAV, "")).content_type == "audio/mpeg"


def test_a_file_object_is_sent_under_the_last_part_of_its_name_and_read_from_its_start(tmp_path: Path) -> None:
    path = tmp_path / "take.ogg"
    path.write_bytes(WAV)
    with path.open("rb") as file:
        file.read(4)
        assert read_upload("file", file) == FilePart("take.ogg", WAV, "audio/ogg")


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (WAV, 'file needs a filename: pass ("clip.wav", data) rather than the bytes alone.'),
        (io.BytesIO(WAV), 'file needs a filename: pass ("clip.wav", file) for a file object without a name.'),
        (("", WAV), 'file needs a filename, such as "clip.wav".'),
        ("", 'file needs a filename, such as "clip.wav".'),
        (("clip.wav", "RIFF"), "file's content must be bytes or a binary file object."),
        (("clip.wav", WAV, "audio/wav\r\nx-other: 1"), "file's content type has a character a header can't carry."),
        (
            ("clip.wav",),
            "file must be a path, a (filename, content) or (filename, content, content_type) tuple, "
            "or a binary file object with a name.",
        ),
        (
            42,
            "file must be a path, a (filename, content) or (filename, content, content_type) tuple, "
            "or a binary file object with a name.",
        ),
    ],
    ids=["bytes", "nameless file", "empty filename", "empty path", "text", "bad type", "short tuple", "number"],
)
def test_it_refuses_what_it_can_t_send_saying_what_to_pass(value: object, message: str) -> None:
    with pytest.raises(NeuronAIError) as caught:
        read_upload("file", value)
    assert str(caught.value) == message


def test_it_refuses_a_file_opened_as_text(tmp_path: Path) -> None:
    path = tmp_path / "clip.wav"
    path.write_bytes(WAV)
    with path.open(encoding="latin-1") as file, pytest.raises(NeuronAIError) as caught:
        read_upload("file", file)
    assert str(caught.value) == 'file must be opened in binary mode, such as open(path, "rb").'


def test_a_path_it_can_t_read_raises_neuron_ai_error_naming_it(tmp_path: Path) -> None:
    missing = tmp_path / "missing.wav"
    with pytest.raises(NeuronAIError) as caught:
        read_upload("file", missing)
    assert str(caught.value) == f"file couldn't be read from {missing}: No such file or directory"
    assert isinstance(caught.value.__cause__, FileNotFoundError)


def test_a_form_sends_text_list_items_and_files_as_parts_in_order() -> None:
    fields = {"name": "Office voice", "ref_text": None, "tags": ["support", "calm"], "none": [], "count": 2}
    form = Form({**fields, "ref_audio": ("sample.wav", WAV)}, ("ref_audio",))
    body, content_type = encode_form(form, boundary="b0undary")
    assert content_type == "multipart/form-data; boundary=b0undary"
    assert body == (
        b'--b0undary\r\nContent-Disposition: form-data; name="name"\r\n\r\nOffice voice\r\n'
        b'--b0undary\r\nContent-Disposition: form-data; name="tags[]"\r\n\r\nsupport\r\n'
        b'--b0undary\r\nContent-Disposition: form-data; name="tags[]"\r\n\r\ncalm\r\n'
        b'--b0undary\r\nContent-Disposition: form-data; name="count"\r\n\r\n2\r\n'
        b'--b0undary\r\nContent-Disposition: form-data; name="ref_audio"; filename="sample.wav"\r\n'
        b"Content-Type: audio/wav\r\n\r\n" + WAV + b"\r\n"
        b"--b0undary--\r\n"
    )


def test_a_form_escapes_quotes_and_line_breaks_in_names_and_filenames_and_sends_text_as_given() -> None:
    form = Form({'say "hi"': "line one\nline two", "file": ('a "b"\r\n.wav', WAV)}, ("file",))
    body, _ = encode_form(form, boundary="b")
    assert b'name="say %22hi%22"\r\n\r\nline one\nline two\r\n' in body
    assert b'name="file"; filename="a %22b%22%0D%0A.wav"\r\nContent-Type: audio/wav\r\n' in body


def test_each_form_gets_its_own_random_boundary() -> None:
    first, second = (encode_form(Form({"name": "V"}, ()))[1] for _ in range(2))
    assert first != second
