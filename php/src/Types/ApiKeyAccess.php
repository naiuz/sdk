<?php

declare(strict_types=1);

namespace Naiuz\Types;

/**
 * How much a key may do. A key's own access stays a string, so a value the API adds later still arrives: compare it
 * with a case's value.
 *
 * A full key holds every product at its highest level, products added later included, but never `api_keys`, which is
 * only ever granted explicitly. A restricted key holds exactly the levels in its permissions map.
 */
enum ApiKeyAccess: string
{
    case Full = 'full';
    case Restricted = 'restricted';
}
