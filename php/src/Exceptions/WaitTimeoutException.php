<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

use Naiuz\Types\TtsJob;

/**
 * Waiting for a synthesis job ran out of time before the job finished. $job is the job as the last poll saw it:
 * fetch its audio once it has succeeded.
 */
class WaitTimeoutException extends NeuronAIException
{
    /** @param TtsJob $job The job as the last poll saw it. */
    public function __construct(public readonly TtsJob $job, ?string $message = null)
    {
        parent::__construct($message ?? "The job {$job->id} was still {$job->status} when the wait ran out.");
    }
}
