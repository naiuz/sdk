<?php

declare(strict_types=1);

/*
 * Synthesizes a line of speech and saves it as a WAV file.
 */

use Naiuz\NeuronAI;

require __DIR__ . '/../vendor/autoload.php';

$client = new NeuronAI();

$speech = $client->tts->synthesize(['text' => 'Assalomu alaykum! Bu NeuronAI ovozi.', 'voice_id' => 'kamron', 'language' => 'uz', 'quality' => 'standard']);
$speech->save('speech.wav');
echo "Saved speech.wav: {$speech->character_count} characters, {$speech->cost} UZS, request {$speech->request_id}.\n";
