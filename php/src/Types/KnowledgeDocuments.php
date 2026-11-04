<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * An organization's documents.
 */
final readonly class KnowledgeDocuments extends ApiObject
{
    /**
     * @param list<KnowledgeDocument> $documents The documents.
     * @param KnowledgeUsage $usage How much of its room they use.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public array $documents,
        public KnowledgeUsage $usage,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->listOf('documents', KnowledgeDocument::from(...)),
            $fields->objectOf('usage', KnowledgeUsage::from(...)),
            $request_id,
        );
    }
}
