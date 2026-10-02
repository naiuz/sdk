<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use Naiuz\NeuronAI;

/**
 * Clients for the tests, on a mocked HTTP layer.
 */
final class Clients
{
    /** A client on $api that doesn't retry, with the unit tests' key. */
    public static function on(MockClient $api): NeuronAI
    {
        return new NeuronAI(['api_key' => TestHttp::KEY, 'http_client' => $api, 'max_retries' => 0]);
    }
}
