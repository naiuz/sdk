<?php

declare(strict_types=1);

/*
 * Transcribes an audio file, and prints its text with the time of each segment.
 *
 * Usage: php examples/transcribe.php call.mp3
 */

use Naiuz\NeuronAI;

require __DIR__ . '/../vendor/autoload.php';

$path = $argv[1] ?? null;
if ($path === null) {
    exit("Pass the audio file's path: php examples/transcribe.php call.mp3\n");
}

$client = new NeuronAI();

$transcription = $client->stt->transcribe(['file' => $path, 'language' => 'uz']);
foreach ($transcription->segments as $segment) {
    printf("[%.1f-%.1f s] %s\n", $segment->start, $segment->end, $segment->text);
}
printf("%.1f s of audio, %s UZS.\n", $transcription->duration_seconds, $transcription->cost);
