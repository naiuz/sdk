"""Finds the documents closest to a question: first by embedding similarity, then with rerank."""

import math

from naiuz import NeuronAI

client = NeuronAI()
question = "O'zbekistonning poytaxti qaysi shahar?"
documents = ["Toshkent O'zbekistonning poytaxti.", "Samarqand qadimiy shahar.", "Bugun havo quyoshli."]


def cosine(a: list[float], b: list[float]) -> float:
    """How alike two vectors point: 1 for the same direction."""
    return sum(x * y for x, y in zip(a, b, strict=True)) / math.sqrt(sum(x * x for x in a) * sum(y * y for y in b))


embeddings = client.embeddings.create(model="bge-m3", input=[question, *documents])
query, *vectors = (item.embedding for item in embeddings.data)
for vector, document in zip(vectors, documents, strict=True):
    print(f"similarity {cosine(query, vector):.3f}  {document}")

ranked = client.rerank.create(model="bge-reranker-v2-m3", query=question, documents=documents, top_n=2)
for result in ranked.results:
    print(f"relevance {result.relevance_score:.3f}  {documents[result.index]}")
print(f"Embeddings cost {embeddings.cost} credits, rerank {ranked.cost} credits.")
