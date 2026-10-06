<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * The documents ranked by relevance_score, highest first.
 */
final readonly class RerankResponse extends ApiObject
{
    /**
     * @param string $id This request's ID, the same as `X-Request-Id`.
     * @param string $model The model's id.
     * @param list<RerankResult> $results The documents ranked by relevance_score, highest first.
     * @param RerankMeta $meta The billed input tokens, in Cohere's shape.
     * @param RerankUsage $usage The same input tokens, in OpenAI's shape.
     * @param float|null $cost The price billed, in credits, from the `X-Cost` header; null when the answer has none. It
     *     isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(\stdClass $sent, public string $id, public string $model, public array $results, public RerankMeta $meta, public RerankUsage $usage, public ?float $cost)
    {
        parent::__construct($sent);
    }

    /**
     * The ranking from the body, as the API sends it.
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
            $fields->string('model'),
            $fields->listOf('results', RerankResult::from(...)),
            $fields->objectOf('meta', RerankMeta::from(...)),
            $fields->objectOf('usage', RerankUsage::from(...)),
            $cost,
        );
    }
}
