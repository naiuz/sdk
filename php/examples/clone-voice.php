<?php

declare(strict_types=1);

/*
 * Clones a voice from a 10-15 second recording, then speaks with it.
 *
 * Usage: php examples/clone-voice.php sample.wav "What the recording says."
 */

use Naiuz\NeuronAI;

require __DIR__ . '/../vendor/autoload.php';

$recording = $argv[1] ?? null;
if ($recording === null) {
    exit("Pass the recording's path, and what it says: php examples/clone-voice.php sample.wav \"Salom!\"\n");
}

$client = new NeuronAI();

$voice = $client->voices->create([
    'name' => 'Example voice',
    'language' => 'uz',
    'ref_audio' => $recording,
    'ref_text' => $argv[2] ?? null,
    'tags' => ['example'],
]);
echo "Created the voice {$voice->id}.\n";

$speech = $client->tts->synthesize(['text' => 'Bu mening klonlangan ovozim.', 'voice_id' => $voice->id, 'language' => 'uz']);
$speech->save('cloned.wav');
echo "Saved cloned.wav.\n";
