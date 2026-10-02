<?php

declare(strict_types=1);

/*
 * Renders a dialogue between two voices into one WAV file, and prints where each line sits.
 */

use Naiuz\NeuronAI;

require __DIR__ . '/../vendor/autoload.php';

$client = new NeuronAI();

$voices = $client->voices->list(['type' => 'stock', 'language' => 'uz', 'limit' => 2])->data;
if (count($voices) < 2) {
    exit("This example needs two Uzbek stock voices.\n");
}
[$first, $second] = $voices;

$dialogue = $client->tts->dialogue([
    'turns' => [
        ['voice_id' => $first->id, 'text' => 'Assalomu alaykum! Bugun havo qanday?'],
        ['voice_id' => $second->id, 'text' => 'Va alaykum assalom! Quyoshli va iliq.'],
    ],
    'gap_ms' => 300,
    'language' => 'uz',
]);
$dialogue->save('dialogue.wav');
foreach ($dialogue->turns as $turn) {
    echo "Turn {$turn->index}, {$turn->voice_id}: {$turn->start_s} s to {$turn->end_s} s\n";
}
