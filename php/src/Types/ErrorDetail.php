<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * What went wrong, in an error answer's envelope.
 */
final readonly class ErrorDetail extends ApiObject
{
    /**
     * @param string $type `insufficient_quota` for 402, `rate_limit_error` for 429, `server_error` for 5xx, and
     *     `invalid_request_error` for every other 4xx.
     * @param string $code A stable, machine-readable code (see ErrorCode). Match on it, never on the message.
     * @param string $message What went wrong, written for people.
     * @param string|null $param The first invalid parameter, or null.
     * @param array<string, string>|null $fields Validation errors only: each invalid field and its first message.
     */
    private function __construct(
        \stdClass $sent,
        public string $type,
        public string $code,
        public string $message,
        public ?string $param,
        public ?array $fields,
    ) {
        parent::__construct($sent);
    }

    /**
     * What went wrong, from its fields as the API sends them.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('type'),
            $fields->string('code'),
            $fields->string('message'),
            $fields->nullableString('param'),
            $fields->optionalStringMap('fields'),
        );
    }
}
