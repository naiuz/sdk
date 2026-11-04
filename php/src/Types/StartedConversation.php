<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A new conversation.
 */
final readonly class StartedConversation extends ApiObject
{
    /**
     * @param string $id The conversation's id, `conv_…`.
     * @param string $agent_id The agent's id.
     * @param string $status Its status.
     * @param ConversationContact $contact Who it's with.
     * @param string $created_at When it started.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $agent_id,
        public string $status,
        public ConversationContact $contact,
        public string $created_at,
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
            $fields->string('agent_id'),
            $fields->string('status'),
            $fields->objectOf('contact', ConversationContact::from(...)),
            $fields->string('created_at'),
            $request_id,
        );
    }
}
