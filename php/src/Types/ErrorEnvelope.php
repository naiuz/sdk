<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The body of every error answer. The SDK throws it as an APIException, which carries the same details.
 */
final readonly class ErrorEnvelope extends ApiObject
{
    /**
     * @param ErrorDetail $error What went wrong.
     * @param string $request_id The same ID as the `X-Request-Id` header.
     */
    private function __construct(\stdClass $sent, public ErrorDetail $error, public string $request_id)
    {
        parent::__construct($sent);
    }

    /**
     * An error answer's body, from its fields as the API sends them.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data): self
    {
        $fields = Fields::of($data);

        return new self($fields->object(), $fields->objectOf('error', ErrorDetail::from(...)), $fields->string('request_id'));
    }
}
