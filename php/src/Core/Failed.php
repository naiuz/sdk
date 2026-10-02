<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * An attempt that failed: the exception to throw, why, and the seconds a `Retry-After` asked for.
 *
 * @internal
 */
final readonly class Failed
{
    public function __construct(public NeuronAIException $error, public AttemptFailure $failure, public ?float $retryAfter) {}
}
