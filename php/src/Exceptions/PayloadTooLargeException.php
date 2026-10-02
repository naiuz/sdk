<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 413: the request is larger than the server accepts.
 */
class PayloadTooLargeException extends APIException {}
