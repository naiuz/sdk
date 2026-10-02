<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A chat model. Send its id as `model`.
 */
final readonly class Model extends ApiObject
{
    /**
     * @param string $id The model's id.
     * @param string $object Always `model`.
     * @param int $created When the model was added, in Unix seconds.
     * @param string $owned_by Who serves the model.
     */
    private function __construct(\stdClass $sent, public string $id, public string $object, public int $created, public string $owned_by)
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

        return new self($fields->object(), $fields->string('id'), $fields->string('object'), $fields->int('created'), $fields->string('owned_by'));
    }
}
