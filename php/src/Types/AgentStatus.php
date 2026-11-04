<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * An agent after publishing.
 */
final readonly class AgentStatus extends ApiObject
{
    /**
     * @param string $state `draft`, `published` or `paused`.
     * @param int|null $live_version The version customers meet.
     * @param int $revision The draft's revision.
     * @param bool $has_unpublished_changes Whether the draft says something the live version doesn't.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $state,
        public ?int $live_version,
        public int $revision,
        public bool $has_unpublished_changes,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('state'),
            $fields->nullableInt('live_version'),
            $fields->int('revision'),
            $fields->bool('has_unpublished_changes'),
            $request_id,
        );
    }
}
