<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * One embedding per input, in the order of `input`.
 */
final readonly class EmbeddingResponse extends ApiObject
{
    /**
     * @param string $object Always `list`.
     * @param string $model The model's id.
     * @param list<Embedding> $data One embedding per input, in the order of `input`.
     * @param EmbeddingUsage $usage The tokens the model counted; prompt_tokens is what is billed.
     * @param float|null $cost The price billed, in UZS, from the `X-Cost` header; null when the answer has none. It
     *     isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(\stdClass $sent, public string $object, public string $model, public array $data, public EmbeddingUsage $usage, public ?float $cost)
    {
        parent::__construct($sent);
    }

    /**
     * The embeddings from the body, as the API sends it.
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
            $fields->string('object'),
            $fields->string('model'),
            $fields->listOf('data', Embedding::from(...)),
            $fields->objectOf('usage', EmbeddingUsage::from(...)),
            $cost,
        );
    }
}
