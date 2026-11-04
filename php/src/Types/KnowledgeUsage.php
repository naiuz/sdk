<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * How much of its room an organization has used.
 */
final readonly class KnowledgeUsage extends ApiObject
{
    /**
     * @param int $used Characters used.
     * @param int $limit Characters it can hold.
     * @param int $always_limit Characters that can be in every prompt.
     */
    private function __construct(
        \stdClass $sent,
        public int $used,
        public int $limit,
        public int $always_limit,
    ) {
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

        return new self(
            $fields->object(),
            $fields->int('used'),
            $fields->int('limit'),
            $fields->int('always_limit'),
        );
    }
}
