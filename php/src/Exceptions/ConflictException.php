<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 409: the request conflicts with the resource's state, or reuses an Idempotency-Key with another body.
 */
class ConflictException extends APIException {}
