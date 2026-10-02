<?php

declare(strict_types=1);

/*
 * Streams a chat completion to the terminal as it is generated.
 */

use Naiuz\NeuronAI;

require __DIR__ . '/../vendor/autoload.php';

$client = new NeuronAI();

$stream = $client->chat->completions->create([
    'model' => 'gemma-4-26b-a4b',
    'messages' => [
        ['role' => 'system', 'content' => 'Qisqa va aniq javob ber.'],
        ['role' => 'user', 'content' => 'Samarqand haqida uch jumla yoz.'],
    ],
    'stream' => true,
]);
foreach ($stream as $chunk) {
    echo $chunk->choices[0]->delta->content ?? '';
    if ($chunk->usage !== null) {
        echo "\n\n{$chunk->usage->total_tokens} tokens\n";
    }
}
