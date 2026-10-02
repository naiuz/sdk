<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * One event of a streamed chat completion (`'stream' => true`).
 *
 * The API document describes these chunks in prose rather than as a schema, so this type follows that prose and the
 * contract fixture: first a chunk whose delta holds the role, then one for each piece of the answer, the last of them
 * naming the finish reason, and then, when the model reports its token counts, a chunk with no choices and usage.
 * Every chunk repeats the same id, created and model.
 */
final readonly class ChatCompletionChunk extends ApiObject
{
    /**
     * @param string $id The completion's id, the same on every chunk.
     * @param string $object Always `chat.completion.chunk`.
     * @param int $created When the completion was created, in Unix seconds.
     * @param string $model The model's id.
     * @param list<ChatCompletionChunkChoice> $choices One choice holding the next piece of the message; empty on the
     *     final usage chunk.
     * @param ChatCompletionUsage|null $usage The tokens billed: on the last chunk only, and only when the model reports
     *     its token counts.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $object,
        public int $created,
        public string $model,
        public array $choices,
        public ?ChatCompletionUsage $usage,
    ) {
        parent::__construct($sent);
    }

    /**
     * A chunk from one event's object, as the API sends it.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('id'),
            $fields->string('object'),
            $fields->int('created'),
            $fields->string('model'),
            $fields->listOf('choices', ChatCompletionChunkChoice::from(...)),
            $fields->optionalObjectOf('usage', ChatCompletionUsage::from(...)),
        );
    }
}
