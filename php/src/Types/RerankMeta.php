<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * What was billed, in Cohere's shape.
 */
final readonly class RerankMeta extends ApiObject
{
    /** @param RerankBilledUnits $billed_units The billed input tokens. */
    private function __construct(\stdClass $sent, public RerankBilledUnits $billed_units)
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

        return new self($fields->object(), $fields->objectOf('billed_units', RerankBilledUnits::from(...)));
    }
}
