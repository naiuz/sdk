<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 422: the request failed validation. $fields maps each invalid field to its first message.
 */
class UnprocessableEntityException extends APIException {}
