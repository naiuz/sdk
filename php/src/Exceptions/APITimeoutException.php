<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * An attempt took longer than its timeout, reading the answer included.
 */
class APITimeoutException extends APIConnectionException
{
    public function __construct(string $message = 'Request timed out.')
    {
        parent::__construct($message);
    }
}
