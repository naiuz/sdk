"""Renders a dialogue between two voices into one WAV file, and prints where each line sits."""

from naiuz import NeuronAI

client = NeuronAI()

voices = client.voices.list(type="stock", language="uz", limit=2)
if len(voices.data) < 2:
    raise SystemExit("This example needs two Uzbek stock voices.")
first, second = voices.data[:2]

dialogue = client.tts.dialogue(
    turns=[
        {"voice_id": first.id, "text": "Assalomu alaykum! Bugun havo qanday?"},
        {"voice_id": second.id, "text": "Va alaykum assalom! Quyoshli va iliq."},
    ],
    gap_ms=300,
    language="uz",
)
dialogue.save("dialogue.wav")
for turn in dialogue.turns:
    print(f"Turn {turn.index}, {turn.voice_id}: {turn.start_s} s to {turn.end_s} s")
