<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * Everything said in a conversation.
 */
final readonly class ConversationTranscript extends ApiObject
{
    /**
     * @param string $conversation_id The conversation's id.
     * @param list<ConversationMessage> $messages Oldest first.
     * @param bool $truncated Whether a very long one stopped short.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $conversation_id,
        public array $messages,
        public bool $truncated,
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
            $fields->string('conversation_id'),
            $fields->listOf('messages', ConversationMessage::from(...)),
            $fields->bool('truncated'),
            $request_id,
        );
    }
}
