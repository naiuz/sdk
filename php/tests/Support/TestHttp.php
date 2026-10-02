<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use GuzzleHttp\Psr7\HttpFactory;
use Naiuz\Core\HttpClient;
use Naiuz\Core\Transport\Psr18Transport;
use Naiuz\Core\Transport\Transport;
use Psr\Http\Client\ClientInterface;

/**
 * An HTTP core for the tests, on a mocked HTTP layer: it records its waits instead of waiting, has no jitter and runs
 * at a fixed time. Its clock for a wait's deadline moves only when it waits.
 */
final class TestHttp
{
    /** The key every unit test's client sends. */
    public const KEY = 'nai_unit_test_key';

    public const BASE_URL = 'https://my.neuronai.uz/api/v1';

    /** The time unit tests run at: Tue, 29 Sep 2026 10:00:00 GMT. */
    public const NOW = 1790676000.0;

    public const USER_AGENT = 'naiuz-php/test (PHP 8.5)';

    public readonly HttpClient $http;

    /** @var list<float> Every wait between attempts, in seconds. */
    public array $waits = [];

    /** The clock a wait's deadline reads, in seconds: each wait moves it on. */
    public float $time = 0.0;

    /**
     * @param array<string, string> $defaultHeaders
     * @param (\Closure(): float)|null $random
     */
    public function __construct(ClientInterface|Transport $api, float $timeout = 1.0, int $maxRetries = 2, array $defaultHeaders = [], ?\Closure $random = null)
    {
        $factory = new HttpFactory();
        $this->http = new HttpClient(
            new \SensitiveParameterValue(self::KEY),
            self::BASE_URL,
            $timeout,
            $maxRetries,
            $defaultHeaders,
            self::USER_AGENT,
            $api instanceof Transport ? $api : new Psr18Transport($api),
            $factory,
            $factory,
            sleep: function (float $seconds): void {
                $this->waits[] = $seconds;
                $this->time += $seconds;
            },
            random: $random ?? static fn(): float => 0.0,
            now: static fn(): float => self::NOW,
            monotonic: fn(): float => $this->time,
        );
    }
}
