// Streams a chat completion to the terminal as it is generated.
import {NeuronAI} from "@naiuz/sdk";

const client = new NeuronAI();

const stream = await client.chat.completions.create({
    model: "gemma-4-26b-a4b",
    messages: [
        {role: "system", content: "Qisqa va aniq javob ber."},
        {role: "user", content: "Samarqand haqida uch jumla yoz."},
    ],
    stream: true,
});
for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta.content ?? "");
    if (chunk.usage) process.stdout.write(`\n\n${String(chunk.usage.total_tokens)} tokens\n`);
}
