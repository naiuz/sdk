<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * Who a conversation is with.
 */
final readonly class ConversationContact extends ApiObject
{
    /**
     * @param string|null $external_id Your own id for them.
     * @param string|null $name Their name.
     * @param string|null $phone Their phone number.
     */
    private function __construct(
        \stdClass $sent,
        public ?string $external_id,
        public ?string $name,
        public ?string $phone,
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
            $fields->nullableString('external_id'),
            $fields->nullableString('name'),
            $fields->nullableString('phone'),
        );
    }
}
