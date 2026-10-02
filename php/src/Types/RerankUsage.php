<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The same input tokens, in OpenAI's shape.
 */
final readonly class RerankUsage extends ApiObject
{
    /**
     * @param int $prompt_tokens The tokens billed.
     * @param int $total_tokens The tokens counted.
     */
    private function __construct(\stdClass $sent, public int $prompt_tokens, public int $total_tokens)
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

        return new self($fields->object(), $fields->int('prompt_tokens'), $fields->int('total_tokens'));
    }
}
