<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A stock voice, or one of your organization's voice clones.
 */
final readonly class Voice extends ApiObject
{
    /**
     * @param string $id The voice's id: pass it as `voice_id`.
     * @param string $name The voice's name.
     * @param string $language The code of the language the voice speaks.
     * @param list<string> $tags The voice's tags: always a list.
     * @param string $type `stock` or `custom`, or a type the API adds later.
     * @param string|null $category The voice's category (see VoiceCategory), or null; the API may leave it out.
     * @param string|null $ref_text The reference clip's transcript, or null; the API may leave it out.
     * @param string|null $created_at When the voice was created (ISO 8601), or null; the API may leave it out.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id`, else its
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $name,
        public string $language,
        public array $tags,
        public string $type,
        public ?string $category,
        public ?string $ref_text,
        public ?string $created_at,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * A voice from its fields, as the API sends them.
     *
     * @param \stdClass|array<string, mixed> $data
     *
     * @throws \UnexpectedValueException when a field the API always sends is missing or has another type
     */
    public static function from(\stdClass|array $data, ?string $request_id = null): self
    {
        $fields = Fields::of($data);

        return new self(
            $fields->object(),
            $fields->string('id'),
            $fields->string('name'),
            $fields->string('language'),
            $fields->strings('tags'),
            $fields->string('type'),
            $fields->optionalString('category'),
            $fields->optionalString('ref_text'),
            $fields->optionalString('created_at'),
            $request_id,
        );
    }
}
