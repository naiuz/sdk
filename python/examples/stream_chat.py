"""Streams a chat completion to the terminal as it is generated, with the async client."""

import asyncio

from naiuz import AsyncNeuronAI


async def main() -> None:
    async with AsyncNeuronAI() as client:
        stream = await client.chat.completions.create(
            model="gemma-4-26b-a4b",
            messages=[
                {"role": "system", "content": "Qisqa va aniq javob ber."},
                {"role": "user", "content": "Samarqand haqida uch jumla yoz."},
            ],
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices:
                print(chunk.choices[0].delta.content or "", end="", flush=True)
            if chunk.usage:
                print(f"\n\n{chunk.usage.total_tokens} tokens")


asyncio.run(main())
