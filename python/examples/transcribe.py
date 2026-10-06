"""Transcribes an audio file, and prints its text with the time of each segment.

Usage: python examples/transcribe.py call.mp3
"""

import sys
from pathlib import Path

from naiuz import NeuronAI

if len(sys.argv) < 2:
    raise SystemExit("Pass the audio file's path: python examples/transcribe.py call.mp3")

client = NeuronAI()

transcription = client.stt.transcribe(file=Path(sys.argv[1]), language="uz")
for segment in transcription.segments:
    print(f"[{segment.start:.1f}-{segment.end:.1f} s] {segment.text}")
print(f"{transcription.duration_seconds:.1f} s of audio, {transcription.cost} credits.")
