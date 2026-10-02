<?php

declare(strict_types=1);

namespace Naiuz\Core\Transport;

/**
 * An attempt that got no whole answer: what the HTTP client reported, and what that means for a retry.
 *
 * It never holds the HTTP client's own exception, which holds the request and so the API key.
 *
 * @internal
 */
final class TransportFailure extends \Exception
{
    /**
     * @param string $reason The deepest message the HTTP client gave, or a warning it raised.
     * @param bool $timedOut Whether the attempt ran out of time.
     * @param bool $beforeSend Whether the request surely never reached the server.
     * @param bool $reading Whether the answer had started to arrive.
     */
    public function __construct(string $reason, public readonly bool $timedOut, public readonly bool $beforeSend = false, public readonly bool $reading = false)
    {
        parent::__construct($reason);
    }
}
