"""Synthesizes a line of speech and saves it as a WAV file."""

from naiuz import NeuronAI

client = NeuronAI()

speech = client.tts.synthesize(
    text="Assalomu alaykum! Bu NeuronAI ovozi.", voice_id="kamron", language="uz", quality="standard"
)
speech.save("speech.wav")
print(f"Saved speech.wav: {speech.character_count} characters, {speech.cost} credits, request {speech.request_id}.")
