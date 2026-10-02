<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;

/**
 * Chat's methods, each returning a RawResponse: the result with its answer's status and headers.
 */
readonly class ChatWithRawResponse
{
    /** Chat completions. */
    public CompletionsWithRawResponse $completions;

    /** @internal */
    public function __construct(HttpClient $http)
    {
        $this->completions = new CompletionsWithRawResponse($http);
    }
}
