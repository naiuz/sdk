"""Clones a voice from a 10-15 second recording, then speaks with it.

Usage: python examples/clone_voice.py sample.wav "What the recording says."
"""

import sys
from pathlib import Path

from naiuz import NeuronAI

if len(sys.argv) < 2:
    raise SystemExit('Pass the recording\'s path, and what it says: python examples/clone_voice.py sample.wav "Salom!"')
recording = Path(sys.argv[1])
transcript = sys.argv[2] if len(sys.argv) > 2 else None

client = NeuronAI()

voice = client.voices.create(
    name="Example voice", language="uz", ref_audio=recording, ref_text=transcript, tags=["example"]
)
print(f"Created the voice {voice.id}.")

speech = client.tts.synthesize(text="Bu mening klonlangan ovozim.", voice_id=voice.id, language="uz")
speech.save("cloned.wav")
print("Saved cloned.wav.")
