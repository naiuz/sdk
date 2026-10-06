// Finds the documents closest to a question: first by embedding similarity, then with rerank.
import {NeuronAI} from "@naiuz/sdk";

const client = new NeuronAI();
const question = "O'zbekistonning poytaxti qaysi shahar?";
const documents = ["Toshkent O'zbekistonning poytaxti.", "Samarqand qadimiy shahar.", "Bugun havo quyoshli."];

const embeddings = await client.embeddings.create({model: "bge-m3", input: [question, ...documents]});
const [query = [], ...vectors] = embeddings.data.map((item) => item.embedding);
const cosine = (a: number[], b: number[]): number => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    a.forEach((value, index) => {
        const other = b[index] ?? 0;
        dot += value * other;
        normA += value * value;
        normB += other * other;
    });
    return dot / Math.sqrt(normA * normB);
};
vectors.forEach((vector, index) => {
    console.log(`similarity ${cosine(query, vector).toFixed(3)}  ${documents[index] ?? ""}`);
});

const ranked = await client.rerank.create({model: "bge-reranker-v2-m3", query: question, documents, top_n: 2});
for (const result of ranked.results) console.log(`relevance ${result.relevance_score.toFixed(3)}  ${documents[result.index] ?? ""}`);
console.log(`Embeddings cost ${String(embeddings.cost)} credits, rerank ${String(ranked.cost)} credits.`);
