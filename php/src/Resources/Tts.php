<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;

/**
 * Text to speech.
 */
readonly class Tts
{
    /** Synthesis jobs: queue a long text, then poll the job until it finishes. */
    public TtsJobs $jobs;

    /** @internal */
    public function __construct(HttpClient $http)
    {
        $this->jobs = new TtsJobs($http);
    }
}
