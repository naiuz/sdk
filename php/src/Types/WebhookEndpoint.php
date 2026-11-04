<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * An address that hears of events. Its secret is never here.
 */
final readonly class WebhookEndpoint extends ApiObject
{
    /**
     * @param string $id The endpoint's id, `whe_…`.
     * @param string $url The address.
     * @param string $host The address's host.
     * @param list<string> $events What it hears of.
     * @param string $status `active`, `disabled`, or `failing` once failures have turned it off.
     * @param string|null $failing_because `three_events` or `one_day` while it's `failing`.
     * @param WebhookLastDelivery|null $last_delivery How the last delivery went.
     * @param string $created_at When it was added.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id` or
     *     `X-Request-Id` header; null inside a page. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public string $id,
        public string $url,
        public string $host,
        public array $events,
        public string $status,
        public ?string $failing_because,
        public ?WebhookLastDelivery $last_delivery,
        public string $created_at,
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
            $fields->string('id'),
            $fields->string('url'),
            $fields->string('host'),
            $fields->strings('events'),
            $fields->string('status'),
            $fields->nullableString('failing_because'),
            $fields->nullableObjectOf('last_delivery', WebhookLastDelivery::from(...)),
            $fields->string('created_at'),
            $request_id,
        );
    }
}
