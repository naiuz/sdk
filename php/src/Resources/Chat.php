<?php

declare(strict_types=1);

namespace Naiuz\Resources;

use Naiuz\Core\HttpClient;

/**
 * Chat.
 */
readonly class Chat
{
    /** Chat completions. */
    public Completions $completions;

    /** @internal */
    public function __construct(HttpClient $http)
    {
        $this->completions = new Completions($http);
    }
}
