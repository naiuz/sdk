<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * An agent. `revision` and `config` come with `retrieve`.
 */
final readonly class Agent extends ApiObject
{
    /**
     * @param string $id The agent's id, `agent_…`.
     * @param string $name The agent's name.
     * @param string $state `draft`, `published` or `paused`.
     * @param int|null $live_version The version customers meet, or `null` before the first publish.
     * @param bool $has_unpublished_changes Whether the draft says something the live version doesn't.
     * @param list<string> $languages The draft's languages, the main one first.
     * @param string|null $last_published_at When it was last published.
     * @param list<AgentChannel> $channels Where it answers.
     * @param int|null $revision The draft's revision, to change it from.
     * @param \stdClass|null $config The draft: its prompt, languages, tools and the rest.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $name,
        public string $state,
        public ?int $live_version,
        public bool $has_unpublished_changes,
        public array $languages,
        public ?string $last_published_at,
        public array $channels,
        public ?int $revision,
        public ?\stdClass $config,
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
            $fields->string('id'),
            $fields->string('name'),
            $fields->string('state'),
            $fields->nullableInt('live_version'),
            $fields->bool('has_unpublished_changes'),
            $fields->strings('languages'),
            $fields->nullableString('last_published_at'),
            $fields->listOf('channels', AgentChannel::from(...)),
            $fields->optionalInt('revision'),
            $fields->optionalObject('config'),
            $request_id,
        );
    }
}
