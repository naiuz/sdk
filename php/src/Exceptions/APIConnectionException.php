<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * The API couldn't be reached, or the connection failed before a whole answer arrived: DNS, TLS, or a refused, reset
 * or dropped connection. The message says what the HTTP client reported.
 */
class APIConnectionException extends NeuronAIException
{
    public function __construct(string $message = 'Connection error.')
    {
        parent::__construct($message);
    }
}
