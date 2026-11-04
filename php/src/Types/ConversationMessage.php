<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * Something said in a conversation.
 */
final readonly class ConversationMessage extends ApiObject
{
    /**
     * @param string $id The message's id.
     * @param string $role `customer`, `agent` or `operator`.
     * @param string $text What was said.
     * @param string|null $client_message_id Your own id for a message you sent.
     * @param string $occurred_at When it was said.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $role,
        public string $text,
        public ?string $client_message_id,
        public string $occurred_at,
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
            $fields->string('role'),
            $fields->string('text'),
            $fields->nullableString('client_message_id'),
            $fields->string('occurred_at'),
            $request_id,
        );
    }
}
