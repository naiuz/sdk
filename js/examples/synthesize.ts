// Synthesizes a line of speech and saves it as a WAV file.
import {NeuronAI} from "@naiuz/sdk";

const client = new NeuronAI();

const speech = await client.tts.synthesize({text: "Assalomu alaykum! Bu NeuronAI ovozi.", voice_id: "kamron", language: "uz", quality: "standard"});
await speech.save("speech.wav");
console.log(`Saved speech.wav: ${String(speech.character_count)} characters, ${String(speech.cost)} credits, request ${String(speech.request_id)}.`);
