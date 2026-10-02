<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * The connection failed.
 *
 * @internal
 */
final readonly class ConnectionFailure implements AttemptFailure
{
    /** @param bool $beforeSend Whether the request surely never reached the server. */
    public function __construct(public bool $beforeSend) {}
}
