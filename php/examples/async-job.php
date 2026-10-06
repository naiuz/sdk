<?php

declare(strict_types=1);

/*
 * Queues a long text as a synthesis job, waits for it to finish, and saves its audio.
 */

use Naiuz\Exceptions\WaitTimeoutException;
use Naiuz\NeuronAI;

require __DIR__ . '/../vendor/autoload.php';

$client = new NeuronAI();
$text = str_repeat("Bir bor ekan, bir yo'q ekan, qadim zamonda bir dono podsho yashagan ekan. ", 10);

try {
    $job = $client->tts->jobs->createAndWait(['text' => $text, 'voice_id' => 'kamron', 'language' => 'uz'], ['timeout' => 10 * 60]);
} catch (WaitTimeoutException $error) {
    exit("The job {$error->job->id} is still {$error->job->status}: fetch its audio later with tts->jobs->audio().\n");
}
if ($job->status === 'succeeded') {
    // A finished job's audio is kept for 24 hours: download it now.
    $client->tts->jobs->audio($job->id)->save('story.wav');
    echo "Saved story.wav: {$job->cost} credits.\n";
} else {
    echo 'The job failed: ' . ($job->error->code ?? 'unknown') . ".\n";
}
