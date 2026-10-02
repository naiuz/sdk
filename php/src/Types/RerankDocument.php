<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A ranked document's text.
 */
final readonly class RerankDocument extends ApiObject
{
    /** @param string $text The document's text. */
    private function __construct(\stdClass $sent, public string $text)
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

        return new self($fields->object(), $fields->string('text'));
    }
}
