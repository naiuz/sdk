<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A key's level for every product: `none`, `read` or `write`, as each product allows, or a level the API adds later.
 */
final readonly class ApiKeyPermissions extends ApiObject
{
    /**
     * @param string $tts Text to speech: `none`, `read` or `write`.
     * @param string $voices Voices: `none`, `read` or `write`.
     * @param string $stt Speech to text: `none` or `write`.
     * @param string $llm Chat completions and models: `none`, `read` or `write`.
     * @param string $embeddings Embeddings: `none` or `write`.
     * @param string $rerank Rerank: `none` or `write`.
     * @param string $account Balance and usage: `none` or `read`.
     * @param string $api_keys API keys: `none`, `read` or `write`.
     */
    private function __construct(
        \stdClass $sent,
        public string $tts,
        public string $voices,
        public string $stt,
        public string $llm,
        public string $embeddings,
        public string $rerank,
        public string $account,
        public string $api_keys,
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
            $fields->string('tts'),
            $fields->string('voices'),
            $fields->string('stt'),
            $fields->string('llm'),
            $fields->string('embeddings'),
            $fields->string('rerank'),
            $fields->string('account'),
            $fields->string('api_keys'),
        );
    }
}
