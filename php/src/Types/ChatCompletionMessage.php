<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The assistant's message.
 */
final readonly class ChatCompletionMessage extends ApiObject
{
    /**
     * @param string $role Always `assistant`.
     * @param string $content The answer's text.
     */
    private function __construct(\stdClass $sent, public string $role, public string $content)
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

        return new self($fields->object(), $fields->string('role'), $fields->string('content'));
    }
}
