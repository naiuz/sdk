<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The billed input tokens, in Cohere's shape.
 */
final readonly class RerankBilledUnits extends ApiObject
{
    /**
     * @param int $search_units Always 1.
     * @param int $input_tokens The input tokens billed.
     */
    private function __construct(\stdClass $sent, public int $search_units, public int $input_tokens)
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

        return new self($fields->object(), $fields->int('search_units'), $fields->int('input_tokens'));
    }
}
