<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use GuzzleHttp\Psr7\HttpFactory;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Transport\Transport;
use Naiuz\NeuronAI;

/**
 * Clients for the tests, on a mocked HTTP layer or a real one.
 */
final class Clients
{
    /** A client on $api that doesn't retry, with the unit tests' key. */
    public static function on(MockClient $api): NeuronAI
    {
        return new NeuronAI(['api_key' => TestHttp::KEY, 'http_client' => $api, 'max_retries' => 0]);
    }

    /** An HTTP core on a real transport to $baseUrl, such as a local server's: the real clock, and no retries. */
    public static function http(Transport $transport, string $baseUrl, float $timeout = NeuronAI::DEFAULT_TIMEOUT): HttpClient
    {
        $factory = new HttpFactory();

        return new HttpClient(new \SensitiveParameterValue(TestHttp::KEY), $baseUrl, $timeout, 0, [], TestHttp::USER_AGENT, $transport, $factory, $factory);
    }
}
