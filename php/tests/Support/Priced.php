<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use Naiuz\Core\Fields;
use Naiuz\Types\ApiObject;

/**
 * A compatible endpoint's body, for the core's tests.
 */
final readonly class Priced extends ApiObject
{
    private function __construct(\stdClass $sent, public string $id, public ?float $cost)
    {
        parent::__construct($sent);
    }

    /** @param \stdClass|array<string, mixed> $data */
    public static function from(\stdClass|array $data, ?float $cost = null): self
    {
        $fields = Fields::of($data);

        return new self($fields->object(), $fields->string('id'), $cost);
    }
}
