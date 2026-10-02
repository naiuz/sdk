<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * The attempt ran out of time after the request may have been sent.
 *
 * @internal
 */
final readonly class TimeoutFailure implements AttemptFailure {}
