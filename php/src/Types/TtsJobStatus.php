<?php

declare(strict_types=1);

namespace Naiuz\Types;

/**
 * Where a synthesis job stands. Succeeded and Failed are final. A job's own status stays a string, so a status the
 * API adds later still arrives: compare it with a case's value.
 */
enum TtsJobStatus: string
{
    case Queued = 'queued';
    case Running = 'running';
    case Succeeded = 'succeeded';
    case Failed = 'failed';
}
