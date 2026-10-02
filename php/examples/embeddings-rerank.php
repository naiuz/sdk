<?php

declare(strict_types=1);

/*
 * Finds the documents closest to a question: first by embedding similarity, then with rerank.
 */

use Naiuz\NeuronAI;
use Naiuz\Types\Embedding;

require __DIR__ . '/../vendor/autoload.php';

$client = new NeuronAI();
$question = "O'zbekistonning poytaxti qaysi shahar?";
$documents = ["Toshkent O'zbekistonning poytaxti.", 'Samarqand qadimiy shahar.', 'Bugun havo quyoshli.'];

/**
 * How alike two vectors point: 1 for the same direction.
 *
 * @param list<float> $a
 * @param list<float> $b
 */
function cosine(array $a, array $b): float
{
    $dot = 0.0;
    $normA = 0.0;
    $normB = 0.0;
    foreach ($a as $i => $value) {
        $other = $b[$i] ?? 0.0;
        $dot += $value * $other;
        $normA += $value * $value;
        $normB += $other * $other;
    }

    return $dot / sqrt($normA * $normB);
}

$embeddings = $client->embeddings->create(['model' => 'bge-m3', 'input' => [$question, ...$documents]]);
$vectors = array_map(static fn(Embedding $item): array => $item->embedding, $embeddings->data);
$query = array_shift($vectors) ?? [];
foreach ($vectors as $i => $vector) {
    printf("similarity %.3f  %s\n", cosine($query, $vector), $documents[$i] ?? '');
}

$ranked = $client->rerank->create(['model' => 'bge-reranker-v2-m3', 'query' => $question, 'documents' => $documents, 'top_n' => 2]);
foreach ($ranked->results as $result) {
    printf("relevance %.3f  %s\n", $result->relevance_score, $documents[$result->index] ?? '');
}
echo "Embeddings cost {$embeddings->cost} UZS, rerank {$ranked->cost} UZS.\n";
