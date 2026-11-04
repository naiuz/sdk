<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A link a page opens a conversation with.
 */
final readonly class AgentSignedUrl extends ApiObject
{
    /**
     * @param string $signed_url The link, for the page's `signedUrl`. It works once.
     * @param string $expires_at When it stops working, 15 minutes on.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $signed_url,
        public string $expires_at,
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
            $fields->string('signed_url'),
            $fields->string('expires_at'),
            $request_id,
        );
    }
}
