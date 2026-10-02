<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\APIRequest;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Readers;
use Naiuz\Core\RequestOptions;
use Naiuz\Core\RetryClass;
use Naiuz\Types\ModelList;

/**
 * The chat models available to your account.
 *
 * @phpstan-import-type CallOptions from RequestOptions
 */
readonly class Models
{
    /** @internal */
    public function __construct(private HttpClient $http) {}

    /**
     * The chat models available to your account, in OpenAI's list shape.
     *
     * @param CallOptions $options
     */
    public function list(array $options = []): ModelList
    {
        $request = new APIRequest('GET', '/models', RetryClass::Safe, options: RequestOptions::from($options));

        return $this->http->request($request, Readers::body(ModelList::from(...)));
    }
}
