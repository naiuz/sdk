<?php

declare(strict_types=1);

namespace Naiuz\Exceptions;

/**
 * The API answered with an error. A status with its own class throws that class; any other throws APIException.
 *
 * getMessage() says what went wrong, written for people: match on error_code, never on the message. getCode() is the
 * HTTP status.
 */
class APIException extends NeuronAIException
{
    /**
     * @param string $message What went wrong, written for people.
     * @param int $status The HTTP status.
     * @param string|null $type `invalid_request_error`, `insufficient_quota`, `rate_limit_error` or `server_error`;
     *     null outside the API's error envelope.
     * @param string|null $error_code The envelope's `code`: a stable, machine-readable code, such as
     *     `insufficient_balance` (see ErrorCode). Null outside the envelope.
     * @param string|null $param The first invalid parameter, or null.
     * @param array<string, string>|null $fields Validation errors only: each invalid field and its first message.
     * @param string|null $request_id The request's ID, to quote to support: the envelope's `request_id`, else the
     *     `X-Request-Id` header, else null.
     * @param array<string, string> $headers The answer's headers, by lower-case name; a repeated header's values are
     *     joined with ", ".
     */
    public function __construct(
        string $message,
        public readonly int $status,
        public readonly ?string $type = null,
        public readonly ?string $error_code = null,
        public readonly ?string $param = null,
        public readonly ?array $fields = null,
        public readonly ?string $request_id = null,
        public readonly array $headers = [],
    ) {
        parent::__construct($message, $status);
    }
}
