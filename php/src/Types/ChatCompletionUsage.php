<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The tokens billed.
 */
final readonly class ChatCompletionUsage extends ApiObject
{
    /**
     * @param int $prompt_tokens The prompt's tokens.
     * @param int $completion_tokens The answer's tokens.
     * @param int $total_tokens Both together.
     */
    private function __construct(\stdClass $sent, public int $prompt_tokens, public int $completion_tokens, public int $total_tokens)
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

        return new self($fields->object(), $fields->int('prompt_tokens'), $fields->int('completion_tokens'), $fields->int('total_tokens'));
    }
}
