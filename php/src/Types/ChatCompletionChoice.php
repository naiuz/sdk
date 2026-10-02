<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * One choice of the completion.
 */
final readonly class ChatCompletionChoice extends ApiObject
{
    /**
     * @param int $index The choice's position, from 0.
     * @param ChatCompletionMessage $message The assistant's message.
     * @param string $finish_reason Why generation stopped, such as `stop`.
     */
    private function __construct(\stdClass $sent, public int $index, public ChatCompletionMessage $message, public string $finish_reason)
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

        return new self($fields->object(), $fields->int('index'), $fields->objectOf('message', ChatCompletionMessage::from(...)), $fields->string('finish_reason'));
    }
}
