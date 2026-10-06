<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * One API key's requests and spend in the window.
 */
final readonly class UsageByKey extends ApiObject
{
    /**
     * @param string|null $id The key's `id`, as the API keys endpoints show it, or null for requests made from the
     *     dashboard.
     * @param string $name The key's name.
     * @param int $requests The requests made.
     * @param float $cost The spend, in credits.
     */
    private function __construct(\stdClass $sent, public ?string $id, public string $name, public int $requests, public float $cost)
    {
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

        return new self($fields->object(), $fields->nullableString('id'), $fields->string('name'), $fields->int('requests'), $fields->float('cost'));
    }
}
