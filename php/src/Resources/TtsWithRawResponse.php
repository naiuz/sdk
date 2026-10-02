<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;

/**
 * Text to speech's methods, each returning a RawResponse: the result with its answer's status and headers.
 */
readonly class TtsWithRawResponse
{
    /** Synthesis jobs. */
    public TtsJobsWithRawResponse $jobs;

    /** @internal */
    public function __construct(HttpClient $http)
    {
        $this->jobs = new TtsJobsWithRawResponse($http);
    }
}
