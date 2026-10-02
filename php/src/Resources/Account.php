<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Params;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Types\Balance;
use Naiuz\Types\Usage;

/**
 * Your organization's balance and usage.
 *
 * @phpstan-type UsageParams array{days?: 7|30|90|null}
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Account
{
    private const USAGE_PARAMS = ['days'];

    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * The remaining credit of the calling key's organization, and its prices. Use it to surface a low balance before
     * a request fails with 402.
     *
     * @param CallOptions $options
     */
    public function balance(array $options = []): Balance
    {
        $request = new APIRequest('GET', '/balance', RetryClass::Safe, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Balance::from(...)));
    }

    /**
     * Spend and request counts of the calling key's organization, grouped by service and by API key. Reading usage is
     * free.
     *
     * @param UsageParams $query
     *     - days: how many days to count, today included: 7, 30 or 90 (30 when left out).
     * @param CallOptions $options
     */
    public function usage(array $query = [], array $options = []): Usage
    {
        $query = Params::check('account->usage', $query, self::USAGE_PARAMS);
        $request = new APIRequest('GET', '/usage', RetryClass::Safe, query: $query, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::envelope(Usage::from(...)));
    }
}
