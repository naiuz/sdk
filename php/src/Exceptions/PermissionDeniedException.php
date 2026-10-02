<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 403: the key may not do this, from this address, or with this voice.
 */
class PermissionDeniedException extends APIException {}
