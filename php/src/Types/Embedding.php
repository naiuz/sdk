<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * One input's vector.
 */
final readonly class Embedding extends ApiObject
{
    /**
     * @param string $object Always `embedding`.
     * @param int $index The position of its input, from 0.
     * @param list<float> $embedding A 1024-dimensional vector of floats.
     */
    private function __construct(\stdClass $sent, public string $object, public int $index, public array $embedding)
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

        return new self($fields->object(), $fields->string('object'), $fields->int('index'), $fields->floats('embedding'));
    }
}
