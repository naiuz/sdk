<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The piece of the assistant's message a chunk carries.
 */
final readonly class ChatCompletionChunkDelta extends ApiObject
{
    /**
     * @param string|null $role `assistant`, on the stream's first chunk only; null on the others.
     * @param string|null $content The next piece of the answer's text, or null when the chunk carries none.
     */
    private function __construct(\stdClass $sent, public ?string $role, public ?string $content)
    {
        parent::__construct($sent);
    }

    /**
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field has another type
     */
    public static function from(\stdClass|array $data): self
    {
        $fields = Fields::of($data);

        return new self($fields->object(), $fields->optionalString('role'), $fields->optionalString('content'));
    }
}
