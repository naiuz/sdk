<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 402: the balance is too low, or the key's monthly spend limit would be passed.
 */
class InsufficientQuotaException extends APIException {}
