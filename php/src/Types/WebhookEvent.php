<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * An event a webhook brought, once its signature is checked.
 */
final readonly class WebhookEvent extends ApiObject
{
    /**
     * @param string $id The event's id, the same on a retry or a Resend: use it to drop repeats.
     * @param string $type `conversation.message.created` or `conversation.ended`, or an event added later.
     * @param string $created_at When it happened (ISO 8601). A retry can arrive after a newer event, so sort by this.
     * @param \stdClass $data What happened.
     */
    private function __construct(\stdClass $sent, public string $id, public string $type, public string $created_at, public \stdClass $data)
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

        return new self($fields->object(), $fields->string('id'), $fields->string('type'), $fields->string('created_at'), $fields->objectField('data'));
    }
}
