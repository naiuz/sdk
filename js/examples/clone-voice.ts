// Clones a voice from a 10-15 second recording, then speaks with it.
// Usage: node examples/clone-voice.ts sample.wav "What the recording says."
import {readFile} from "node:fs/promises";
import {basename} from "node:path";
import {NeuronAI} from "@naiuz/sdk";

const [path, transcript] = process.argv.slice(2);
if (path === undefined) throw new Error('Pass the recording\'s path, and what it says: node examples/clone-voice.ts sample.wav "Salom!"');

const client = new NeuronAI();

const voice = await client.voices.create({
    name: "Example voice",
    language: "uz",
    ref_audio: {data: await readFile(path), filename: basename(path)},
    ref_text: transcript ?? null,
    tags: ["example"],
});
console.log(`Created the voice ${voice.id}.`);

const speech = await client.tts.synthesize({text: "Bu mening klonlangan ovozim.", voice_id: voice.id, language: "uz"});
await speech.save("cloned.wav");
console.log("Saved cloned.wav.");
