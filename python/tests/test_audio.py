import json
from pathlib import Path

import httpx
import pytest

from naiuz import APIError, NeuronAIError
from naiuz._response import Answer, read_dialogue_audio, read_speech_audio
from naiuz.types import DialogueAudio, SpeechAudio
from tests.helpers import KEY

WAV = b"RIFF\x24\x00\x00\x00WAVEfmt "
SPOKEN = {
    "content-type": "audio/wav",
    "x-cost": "12.5",
    "x-balance": "9987.5",
    "x-character-count": "5",
    "x-voice-custom": "0",
    "x-latency-ms": "820.5",
    "x-request-id": "req-1",
}
"""The headers synthesize answers with."""
SPEECH = SpeechAudio(
    audio=WAV,
    content_type="audio/wav",
    cost=12.5,
    character_count=5,
    balance=9987.5,
    voice_custom=False,
    latency_ms=820.5,
    replayed=False,
    request_id="req-1",
)
"""What synthesize's headers read as."""
TURNS = [
    {"index": 0, "voice_id": "uz-sardor", "start_s": 0, "end_s": 0.8, "duration_s": 0.8},
    {"index": 1, "voice_id": "uz-malika", "start_s": 1.1, "end_s": 2.4, "duration_s": 1.3},
]


def answer(headers: dict[str, str], content: bytes = WAV) -> Answer:
    return Answer(200, "OK", httpx.Headers(headers), content, lambda text: text.replace(KEY, "[redacted]"))


def test_it_reads_the_wav_and_turns_its_headers_into_typed_fields() -> None:
    audio = read_speech_audio(answer(SPOKEN))
    assert audio == SPEECH
    assert type(audio.character_count) is int


def test_it_reads_x_voice_custom_and_idempotency_replayed_as_true_only_for_1() -> None:
    ones = read_speech_audio(answer({**SPOKEN, "x-voice-custom": " 1 ", "idempotency-replayed": "1"}))
    words = read_speech_audio(answer({**SPOKEN, "x-voice-custom": "true", "idempotency-replayed": "yes"}))
    assert (ones.voice_custom, ones.replayed) == (True, True)
    assert (words.voice_custom, words.replayed) == (False, False)


def test_a_header_that_is_missing_or_unreadable_gives_none_and_a_missing_flag_false() -> None:
    bare = read_speech_audio(answer({"content-type": "audio/wav", "x-latency-ms": "n/a", "x-character-count": "5.5"}))
    assert bare == SpeechAudio(WAV, "audio/wav", None, None, None, False, None, False, None)


def test_a_success_that_isn_t_audio_raises_api_error_with_the_key_redacted() -> None:
    page = answer({"content-type": "text/html"}, f"<html>Sign in first. Authorization: Bearer {KEY}</html>".encode())
    with pytest.raises(APIError) as caught:
        read_speech_audio(page)
    assert (caught.value.status, caught.value.code) == (200, None)
    assert caught.value.message == "OK: <html>Sign in first. Authorization: Bearer [redacted]</html>"


def test_a_dialogue_adds_where_each_turn_sits_and_the_turn_count() -> None:
    audio = read_dialogue_audio(answer({**SPOKEN, "x-turns": json.dumps(TURNS), "x-turn-count": "2"}))
    assert isinstance(audio, DialogueAudio)
    assert isinstance(audio, SpeechAudio)
    assert [turn.model_dump() for turn in audio.turns] == TURNS
    assert (audio.turn_count, audio.cost, audio.request_id) == (2, 12.5, "req-1")


@pytest.mark.parametrize("turns", [None, "not json", '{"index": 0}', '[{"index": 0}]'])
def test_a_dialogue_has_no_turns_when_x_turns_is_missing_or_isn_t_a_list_of_turns(turns: str | None) -> None:
    headers = SPOKEN if turns is None else {**SPOKEN, "x-turns": turns}
    assert read_dialogue_audio(answer(headers)).turns == []


def test_save_writes_the_wav_to_the_path_replacing_a_file_already_there(tmp_path: Path) -> None:
    path = tmp_path / "speech.wav"
    path.write_bytes(b"old")
    SPEECH.save(path)
    SPEECH.save(str(tmp_path / "again.wav"))
    assert path.read_bytes() == (tmp_path / "again.wav").read_bytes() == WAV


def test_save_raises_neuron_ai_error_saying_why_the_file_can_t_be_written(tmp_path: Path) -> None:
    path = tmp_path / "missing" / "speech.wav"
    with pytest.raises(NeuronAIError) as caught:
        SPEECH.save(path)
    assert str(caught.value) == f"The audio couldn't be written to {path}: No such file or directory"
    assert isinstance(caught.value.__cause__, FileNotFoundError)


def test_its_repr_gives_the_audio_s_size_rather_than_its_bytes() -> None:
    assert repr(SPEECH) == (
        "SpeechAudio(audio=<16 bytes>, content_type='audio/wav', cost=12.5, character_count=5, balance=9987.5, "
        "voice_custom=False, latency_ms=820.5, replayed=False, request_id='req-1')"
    )
