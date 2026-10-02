<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * One service's requests and spend in the window.
 */
final readonly class UsageByService extends ApiObject
{
    /**
     * @param string $service The service's code, such as `llm`.
     * @param string $label The service's name.
     * @param int $requests The requests made.
     * @param float $cost The spend, in UZS.
     */
    private function __construct(\stdClass $sent, public string $service, public string $label, public int $requests, public float $cost)
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

        return new self($fields->object(), $fields->string('service'), $fields->string('label'), $fields->int('requests'), $fields->float('cost'));
    }
}
