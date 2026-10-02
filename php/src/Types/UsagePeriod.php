<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The counted window: whole days, today included.
 */
final readonly class UsagePeriod extends ApiObject
{
    /**
     * @param int $days How many days were counted.
     * @param string $start The first day counted (`YYYY-MM-DD`).
     * @param string $end The last day counted (`YYYY-MM-DD`): today.
     */
    private function __construct(\stdClass $sent, public int $days, public string $start, public string $end)
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

        return new self($fields->object(), $fields->int('days'), $fields->string('start'), $fields->string('end'));
    }
}
