<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 401: the API key is missing, unknown, disabled, revoked or expired.
 */
class AuthenticationException extends APIException {}
