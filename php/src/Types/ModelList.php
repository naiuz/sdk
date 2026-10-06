<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The chat models, in OpenAI's list shape.
 */
final readonly class ModelList extends ApiObject
{
    /**
     * @param string $object Always `list`.
     * @param list<Model> $data The models.
     * @param float|null $cost The price billed, in credits, from the `X-Cost` header; null when the answer has none. It
     *     isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(\stdClass $sent, public string $object, public array $data, public ?float $cost)
    {
        parent::__construct($sent);
    }

    /**
     * The models from the body, as the API sends it.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?float $cost = null): self
    {
        $fields = Fields::of($data);

        return new self($fields->object(), $fields->string('object'), $fields->listOf('data', Model::from(...)), $cost);
    }
}
