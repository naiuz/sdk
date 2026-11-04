<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A channel an agent answers on.
 */
final readonly class AgentChannel extends ApiObject
{
    /**
     * @param int $id The channel's id.
     * @param string $type `telegram`, `instagram`, `facebook`, `widget` or `voice`.
     * @param string $name The channel's name.
     */
    private function __construct(
        \stdClass $sent,
        public int $id,
        public string $type,
        public string $name,
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
            $fields->int('id'),
            $fields->string('type'),
            $fields->string('name'),
        );
    }
}
