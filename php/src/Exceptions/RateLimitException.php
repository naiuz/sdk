<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * 429: too many requests.
 */
class RateLimitException extends APIException
{
    /**
     * @param array<string, string>|null $fields
     * @param array<string, string> $headers
     * @param float|null $retry_after The seconds the `Retry-After` header asks for (an HTTP date counts from now), or
     *     null when the answer has none.
     */
    public function __construct(
        string $message,
        int $status,
        ?string $type = null,
        ?string $error_code = null,
        ?string $param = null,
        ?array $fields = null,
        ?string $request_id = null,
        array $headers = [],
        public readonly ?float $retry_after = null,
    ) {
        parent::__construct($message, $status, $type, $error_code, $param, $fields, $request_id, $headers);
    }
}
