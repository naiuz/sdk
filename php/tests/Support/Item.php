<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use Naiuz\Core\Fields;
use Naiuz\Types\ApiObject;

/**
 * Anything an envelope or a page holds, for the core's tests.
 */
final readonly class Item extends ApiObject
{
    private function __construct(\stdClass $sent, public string $id, public ?string $name, public ?string $request_id)
    {
        parent::__construct($sent);
    }

    /** @param \stdClass|array<string, mixed> $data */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self($fields->object(), $fields->string('id'), $fields->optionalString('name'), $request_id);
    }
}
