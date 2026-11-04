<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * How an endpoint's last delivery went.
 */
final readonly class WebhookLastDelivery extends ApiObject
{
    /**
     * @param string $status `pending`, `delivered` or `failed`.
     * @param int|null $status_code The HTTP status the receiver answered.
     * @param string $at When it was tried.
     */
    private function __construct(
        \stdClass $sent,
        public string $status,
        public ?int $status_code,
        public string $at,
    ) {
        parent::__construct($sent);
    }

    /**
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('status'),
            $fields->nullableInt('status_code'),
            $fields->string('at'),
        );
    }
}
