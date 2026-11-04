<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Exceptions\WebhookVerificationException;
use Naiuz\NeuronAI;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class WebhooksTest extends TestCase
{
    /** @return array{secret: string, now: int, tolerance_seconds: int, cases: list<array{name: string, body: string, header: string, valid: bool, secret?: string}>} */
    private static function vectors(): array
    {
        /** @var array{secret: string, now: int, tolerance_seconds: int, cases: list<array{name: string, body: string, header: string, valid: bool, secret?: string}>} $vectors */
        $vectors = json_decode((string) file_get_contents(__DIR__ . '/../../spec/webhooks/signature-vectors.json'), true, 512, JSON_THROW_ON_ERROR);

        return $vectors;
    }

    /** @return iterable<string, array{string, string}> */
    public static function goodSignatures(): iterable
    {
        foreach (self::vectors()['cases'] as $case) {
            if ($case['valid']) {
                yield $case['name'] => [$case['body'], $case['header']];
            }
        }
    }

    /** @return iterable<string, array{string, string, string|null}> */
    public static function badSignatures(): iterable
    {
        foreach (self::vectors()['cases'] as $case) {
            if (! $case['valid']) {
                yield $case['name'] => [$case['body'], $case['header'], $case['secret'] ?? null];
            }
        }
    }

    #[DataProvider('goodSignatures')]
    public function test_it_takes_a_good_signature(string $body, string $header): void
    {
        $vectors = self::vectors();
        $event = (new NeuronAI(['api_key' => 'nai_test']))->webhooks->verify($body, $header, $vectors['secret'], $vectors['tolerance_seconds'], $vectors['now']);

        self::assertStringContainsString('"id":"' . $event->id . '"', $body);
    }

    #[DataProvider('badSignatures')]
    public function test_it_refuses_a_bad_one(string $body, string $header, ?string $secret): void
    {
        $vectors = self::vectors();

        $this->expectException(WebhookVerificationException::class);

        (new NeuronAI(['api_key' => 'nai_test']))->webhooks->verify($body, $header, $secret ?? $vectors['secret'], $vectors['tolerance_seconds'], $vectors['now']);
    }

    public function test_it_refuses_a_request_with_no_header(): void
    {
        $this->expectException(WebhookVerificationException::class);

        (new NeuronAI(['api_key' => 'nai_test']))->webhooks->verify('{}', null, 'whsec_test');
    }

    public function test_it_goes_by_the_clock_when_it_isnt_told_the_time(): void
    {
        $vectors = self::vectors();
        $first = $vectors['cases'][0];

        $this->expectExceptionMessage('too old');

        (new NeuronAI(['api_key' => 'nai_test']))->webhooks->verify($first['body'], $first['header'], $vectors['secret']);
    }
}
