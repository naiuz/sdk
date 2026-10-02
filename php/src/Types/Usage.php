<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Fields;

/**
 * Spend and request counts over the last `days`, grouped by service and by API key.
 */
final readonly class Usage extends ApiObject
{
    /**
     * @param UsagePeriod $period The counted window: whole days, today included.
     * @param UsageTotal $total The whole window's requests and spend.
     * @param list<UsageByService> $by_service One row per service used in the window, the costliest first.
     * @param list<UsageByKey> $by_key One row per API key used in the window, the costliest first.
     * @param string|null $request_id The request's ID, to quote to support: the answer's `request_id`, else its
     *     `X-Request-Id` header. It isn't a field: toArray() and json_encode() leave it out.
     */
    private function __construct(
        \stdClass $sent,
        public UsagePeriod $period,
        public UsageTotal $total,
        public array $by_service,
        public array $by_key,
        public ?string $request_id,
    ) {
        parent::__construct($sent);
    }

    /**
     * Usage from its fields, as the API sends them.
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
            $fields->objectOf('period', UsagePeriod::from(...)),
            $fields->objectOf('total', UsageTotal::from(...)),
            $fields->listOf('by_service', UsageByService::from(...)),
            $fields->listOf('by_key', UsageByKey::from(...)),
            $request_id,
        );
    }
}
