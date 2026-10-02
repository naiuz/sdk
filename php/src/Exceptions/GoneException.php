<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 410: the resource is gone, such as a job's audio past its retention window.
 */
class GoneException extends APIException {}
