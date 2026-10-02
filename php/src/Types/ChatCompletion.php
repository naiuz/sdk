<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The completion: one choice holding the assistant's message, and usage counting the tokens billed.
 */
final readonly class ChatCompletion extends ApiObject
{
    /**
     * @param string $id The completion's id.
     * @param string $object Always `chat.completion`.
     * @param int $created When the completion was created, in Unix seconds.
     * @param string $model The model's id.
     * @param list<ChatCompletionChoice> $choices The choices: one.
     * @param ChatCompletionUsage $usage The tokens billed.
     * @param float|null $cost The price billed, in UZS, from the `X-Cost` header; null when the answer has none. It
     *     isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $object,
        public int $created,
        public string $model,
        public array $choices,
        public ChatCompletionUsage $usage,
        public ?float $cost,
    ) {
        parent::__construct($sent);
    }

    /**
     * The completion from the body, as the API sends it.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?float $cost = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('id'),
            $fields->string('object'),
            $fields->int('created'),
            $fields->string('model'),
            $fields->listOf('choices', ChatCompletionChoice::from(...)),
            $fields->objectOf('usage', ChatCompletionUsage::from(...)),
            $cost,
        );
    }
}
