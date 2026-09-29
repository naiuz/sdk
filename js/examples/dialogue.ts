// Renders a dialogue between two voices into one WAV file, and prints where each line sits.
import {NeuronAI} from "@naiuz/sdk";

const client = new NeuronAI();

const voices = await client.voices.list({type: "stock", language: "uz", limit: 2});
const [first, second] = voices.data;
if (first === undefined || second === undefined) throw new Error("This example needs two Uzbek stock voices.");

const dialogue = await client.tts.dialogue({
    turns: [
        {voice_id: first.id, text: "Assalomu alaykum! Bugun havo qanday?"},
        {voice_id: second.id, text: "Va alaykum assalom! Quyoshli va iliq."},
    ],
    gap_ms: 300,
    language: "uz",
});
await dialogue.save("dialogue.wav");
for (const turn of dialogue.turns) console.log(`Turn ${String(turn.index)}, ${turn.voice_id}: ${String(turn.start_s)} s to ${String(turn.end_s)} s`);
