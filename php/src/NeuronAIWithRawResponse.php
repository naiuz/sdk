<?php

declare(strict_types=1);

namespace Naiuz;

use Naiuz\Core\HttpClient;
use Naiuz\Resources\AccountWithRawResponse;

/**
 * The client's resources, each method returning a RawResponse: its result with the status and headers of the answer
 * it came from. A list's gives its first page.
 */
final readonly class NeuronAIWithRawResponse
{
    /** Your organization's balance and usage. */
    public AccountWithRawResponse $account;

    /** @internal */
    public function __construct(HttpClient $http)
    {
        $this->account = new AccountWithRawResponse($http);
    }
}
