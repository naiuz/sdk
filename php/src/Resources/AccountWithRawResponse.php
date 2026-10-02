<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;
use Naiuz\Core\Raw;
use Naiuz\Core\RequestOptions;
use Naiuz\RawResponse;
use Naiuz\Types\Balance;
use Naiuz\Types\Usage;

/**
 * The account's methods, each returning a RawResponse: the result with its answer's status and headers.
 *
 * @phpstan-import-type UsageParams from Account
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class AccountWithRawResponse
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * @param CallOptions $options
     *
     * @return RawResponse<Balance>
     */
    public function balance(array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Balance => (new Account($http))->balance($options));
    }

    /**
     * @param UsageParams $query
     * @param CallOptions $options
     *
     * @return RawResponse<Usage>
     */
    public function usage(array $query = [], array $options = []): RawResponse
    {
        return Raw::capture($this->http, static fn(HttpClient $http): Usage => (new Account($http))->usage($query, $options));
    }
}
