<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The whole window's requests and spend.
 */
final readonly class UsageTotal extends ApiObject
{
    /**
     * @param int $requests The requests made.
     * @param float $cost The spend, in UZS.
     * @param string $formatted_cost The spend written for people, such as `1 250,50 UZS`.
     * @param string $currency Always `UZS`.
     */
    private function __construct(\stdClass $sent, public int $requests, public float $cost, public string $formatted_cost, public string $currency)
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

        return new self($fields->object(), $fields->int('requests'), $fields->float('cost'), $fields->string('formatted_cost'), $fields->string('currency'));
    }
}
