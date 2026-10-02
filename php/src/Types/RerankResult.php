<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * One ranked document.
 */
final readonly class RerankResult extends ApiObject
{
    /**
     * @param int $index The document's position in `documents`, from 0.
     * @param float $relevance_score How relevant the document is to the query; higher is more relevant.
     * @param RerankDocument|null $document The document's text, unless return_documents was false.
     */
    private function __construct(\stdClass $sent, public int $index, public float $relevance_score, public ?RerankDocument $document)
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

        return new self($fields->object(), $fields->int('index'), $fields->float('relevance_score'), $fields->optionalObjectOf('document', RerankDocument::from(...)));
    }
}
