<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * The API answered with an error status.
 *
 * @internal
 */
final readonly class StatusFailure implements AttemptFailure
{
    /**
     * @param bool $enveloped Whether the body was the API's own error envelope (its code was set). A 5xx without one
     *     is a proxy's or gateway's own page, not the API.
     */
    public function __construct(public int $status, public bool $enveloped) {}
}
