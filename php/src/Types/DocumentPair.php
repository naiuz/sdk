<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A question and its answer.
 */
final readonly class DocumentPair extends ApiObject
{
    /**
     * @param string $question The question.
     * @param string $answer Its answer.
     */
    private function __construct(
        \stdClass $sent,
        public string $question,
        public string $answer,
    ) {
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

        return new self(
            $fields->object(),
            $fields->string('question'),
            $fields->string('answer'),
        );
    }
}
