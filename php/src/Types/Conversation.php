<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A conversation. `variables`, `summary`, `cost` and `has_audio` come with `retrieve`.
 */
final readonly class Conversation extends ApiObject
{
    /**
     * @param string $id The conversation's id, `conv_…`.
     * @param string|null $agent_id The agent's id.
     * @param string|null $source Where it came from, such as `telegram` or `api`.
     * @param string $mode `text` or `voice`.
     * @param string $status Its status, such as `ai_handling` or `resolved`.
     * @param string|null $language The language it's in.
     * @param ConversationContact $contact Who it's with.
     * @param string|null $started_at When it started.
     * @param string|null $last_message_at When the last message was.
     * @param string|null $ended_at When it ended.
     * @param string|null $end_reason Why it ended.
     * @param \stdClass|null $variables The values it was given.
     * @param string|null $summary A summary, once it has ended.
     * @param float|null $cost What it has cost, in credits.
     * @param bool|null $has_audio Whether there's a recording.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public ?string $agent_id,
        public ?string $source,
        public string $mode,
        public string $status,
        public ?string $language,
        public ConversationContact $contact,
        public ?string $started_at,
        public ?string $last_message_at,
        public ?string $ended_at,
        public ?string $end_reason,
        public ?\stdClass $variables,
        public ?string $summary,
        public ?float $cost,
        public ?bool $has_audio,
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
            $fields->nullableString('agent_id'),
            $fields->nullableString('source'),
            $fields->string('mode'),
            $fields->string('status'),
            $fields->nullableString('language'),
            $fields->objectOf('contact', ConversationContact::from(...)),
            $fields->nullableString('started_at'),
            $fields->nullableString('last_message_at'),
            $fields->nullableString('ended_at'),
            $fields->nullableString('end_reason'),
            $fields->optionalObject('variables'),
            $fields->optionalString('summary'),
            $fields->optionalFloat('cost'),
            $fields->optionalBool('has_audio'),
            $request_id,
        );
    }
}
