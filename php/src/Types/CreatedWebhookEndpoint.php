<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * A new endpoint, with its signing secret.
 */
final readonly class CreatedWebhookEndpoint extends ApiObject
{
    /**
     * @param WebhookEndpoint $endpoint The endpoint.
     * @param string $secret The signing secret: the only time it's shown, so store it now.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public WebhookEndpoint $endpoint,
        public string $secret,
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
            $fields->objectOf('endpoint', WebhookEndpoint::from(...)),
            $fields->string('secret'),
            $request_id,
        );
    }
}
