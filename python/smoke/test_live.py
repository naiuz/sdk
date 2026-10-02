"""The live API, called as a user calls it: run apart from the unit tests, with `uv run pytest smoke`.

It needs a restricted key of a test organization with a small balance, in NEURONAI_SMOKE_API_KEY. Without one, every
test here is skipped. The tests run in order, and each uses what the ones before it found.
"""

import os
from collections.abc import Iterator

import pytest

from naiuz import NeuronAI

KEY = os.environ.get("NEURONAI_SMOKE_API_KEY", "").strip()

pytestmark = pytest.mark.skipif(KEY == "", reason="NEURONAI_SMOKE_API_KEY isn't set")


class Found:
    """What a test found for the ones after it."""

    voice_id = ""
    speech = b""


@pytest.fixture(scope="module")
def client() -> Iterator[NeuronAI]:
    with NeuronAI(api_key=KEY) as client:
        yield client


def is_wav(audio: bytes) -> bool:
    """Whether the bytes start as a WAV file does."""
    return audio[:4] == b"RIFF"


def test_it_reads_the_balance(client: NeuronAI) -> None:
    balance = client.account.balance()
    assert isinstance(balance.balance, float)
    assert balance.currency != ""


def test_it_lists_voices(client: NeuronAI) -> None:
    page = client.voices.list(type="stock", language="uz", limit=5)
    assert page.data
    Found.voice_id = page.data[0].id


def test_it_synthesizes_a_short_line(client: NeuronAI) -> None:
    assert Found.voice_id, "the voice list gave a voice"
    speech = client.tts.synthesize(text="Assalomu alaykum! Bu sinov.", voice_id=Found.voice_id, language="uz")
    assert is_wav(speech.audio)
    assert speech.content_type == "audio/wav"
    assert isinstance(speech.cost, float)
    assert speech.request_id is not None
    Found.speech = speech.audio


def test_it_transcribes_a_clip_the_synthesized_line(client: NeuronAI) -> None:
    assert Found.speech, "the synthesis gave audio"
    transcription = client.stt.transcribe(file=("smoke.wav", Found.speech), language="uz")
    assert isinstance(transcription.text, str)
    assert transcription.duration_seconds > 0


def test_it_waits_for_a_synthesis_job_and_downloads_its_audio(client: NeuronAI) -> None:
    job = client.tts.jobs.create_and_wait(
        text="Salom!", voice_id=Found.voice_id, language="uz", poll_interval=1, timeout=120
    )
    assert job.status == "succeeded"
    assert is_wav(client.tts.jobs.audio(job.id).audio)


def test_it_streams_a_chat_completion(client: NeuronAI) -> None:
    models = client.models.list()
    assert models.data, "the model list gave a model"
    question = "Salom! Bir so'z bilan javob ber."
    with client.chat.completions.create(
        model=models.data[0].id, messages=[{"role": "user", "content": question}], max_tokens=16, stream=True
    ) as stream:
        chunks = list(stream)
    assert chunks
    assert "".join(chunk.choices[0].delta.content or "" for chunk in chunks if chunk.choices) != ""
