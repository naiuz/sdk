<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A chunk's choice: the next piece of the assistant's message.
 */
final readonly class ChatCompletionChunkChoice extends ApiObject
{
    /**
     * @param int $index The choice's position, from 0.
     * @param ChatCompletionChunkDelta $delta The next piece of the message: the role on the first chunk, then the text
     *     piece by piece. The chunk that ends the answer may leave it empty.
     * @param string|null $finish_reason Null until the chunk that ends the answer, which names why it stopped, such as
     *     `stop`.
     */
    private function __construct(\stdClass $sent, public int $index, public ChatCompletionChunkDelta $delta, public ?string $finish_reason)
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

        return new self($fields->object(), $fields->int('index'), $fields->objectOf('delta', ChatCompletionChunkDelta::from(...)), $fields->nullableString('finish_reason'));
    }
}
