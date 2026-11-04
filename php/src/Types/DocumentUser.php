<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * An agent that uses a document.
 */
final readonly class DocumentUser extends ApiObject
{
    /**
     * @param string $id The agent's id.
     * @param string $name The agent's name.
     * @param bool $published Whether its live version uses it.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $name,
        public bool $published,
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
            $fields->string('id'),
            $fields->string('name'),
            $fields->bool('published'),
        );
    }
}
