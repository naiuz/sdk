// Transcribes an audio file, and prints its text with the time of each segment.
// Usage: node examples/transcribe.ts call.mp3
import {readFile} from "node:fs/promises";
import {basename} from "node:path";
import {NeuronAI} from "@naiuz/sdk";

const path = process.argv[2];
if (path === undefined) throw new Error("Pass the audio file's path: node examples/transcribe.ts call.mp3");

const client = new NeuronAI();

const transcription = await client.stt.transcribe({file: {data: await readFile(path), filename: basename(path)}, language: "uz"});
for (const segment of transcription.segments) console.log(`[${segment.start.toFixed(1)}-${segment.end.toFixed(1)} s] ${segment.text}`);
console.log(`${transcription.duration_seconds.toFixed(1)} s of audio, ${String(transcription.cost)} credits.`);
