<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\AttemptFailure;
use Naiuz\Core\ConnectionFailure;
use Naiuz\Core\RetryClass;
use Naiuz\Core\RetryPolicy;
use Naiuz\Core\StatusFailure;
use Naiuz\Core\TimeoutFailure;
use PHPUnit\Framework\Attributes\DataProvider;

final class RetryPolicyTest extends TestCase
{
    /** @param list<string> $retriedBy */
    #[DataProvider('table')]
    public function test_is_retryable_follows_the_spec_s_retry_table(AttemptFailure $failure, array $retriedBy): void
    {
        $retrying = array_filter(RetryClass::cases(), static fn(RetryClass $retry): bool => RetryPolicy::isRetryable($retry, $failure));
        self::assertSame($retriedBy, array_values(array_map(static fn(RetryClass $retry): string => $retry->value, $retrying)));
    }

    /** @return iterable<string, array{AttemptFailure, list<string>}> */
    public static function table(): iterable
    {
        $all = ['safe', 'idempotent', 'paid', 'recreate', 'once'];
        yield '429' => [new StatusFailure(429, true), $all];
        yield 'never sent' => [new ConnectionFailure(true), $all];
        yield 'enveloped 500' => [new StatusFailure(500, true), ['safe', 'idempotent', 'paid', 'recreate']];
        yield 'enveloped 502' => [new StatusFailure(502, true), ['safe', 'idempotent', 'paid', 'recreate']];
        yield 'enveloped 503' => [new StatusFailure(503, true), ['safe', 'idempotent', 'paid', 'recreate']];
        yield 'enveloped 504' => [new StatusFailure(504, true), ['safe', 'idempotent', 'paid', 'recreate']];
        yield 'enveloped 501' => [new StatusFailure(501, true), ['idempotent', 'paid', 'recreate']];
        yield 'enveloped 507' => [new StatusFailure(507, true), ['idempotent', 'paid', 'recreate']];
        yield 'bare 502' => [new StatusFailure(502, false), ['safe', 'idempotent']];
        yield 'bare 504' => [new StatusFailure(504, false), ['safe', 'idempotent']];
        yield 'timeout' => [new TimeoutFailure(), ['safe', 'idempotent']];
        yield 'maybe sent' => [new ConnectionFailure(false), ['safe', 'idempotent']];
        yield '400' => [new StatusFailure(400, true), []];
        yield '404' => [new StatusFailure(404, true), []];
        yield '409' => [new StatusFailure(409, true), []];
        yield '422' => [new StatusFailure(422, true), []];
    }

    public function test_delay_doubles_from_half_a_second(): void
    {
        self::assertSame([0.5, 1.0, 2.0, 4.0], array_map(static fn(int $retry): ?float => RetryPolicy::delay($retry, null, static fn(): float => 0.0), range(0, 3)));
    }

    public function test_delay_adds_up_to_25_percent_jitter(): void
    {
        self::assertSame(0.5625, RetryPolicy::delay(0, null, static fn(): float => 0.5));
        self::assertEqualsWithDelta(1.24975, RetryPolicy::delay(1, null, static fn(): float => 0.999), 1e-9);
    }

    public function test_delay_never_waits_more_than_8_seconds_however_many_retries(): void
    {
        self::assertSame(8.0, RetryPolicy::delay(4, null, static fn(): float => 0.999));
        self::assertSame(8.0, RetryPolicy::delay(20, null, static fn(): float => 0.0));
        self::assertSame(8.0, RetryPolicy::delay(5000, null, static fn(): float => 0.0));
    }

    public function test_delay_waits_what_retry_after_says_instead_without_jitter(): void
    {
        self::assertSame(12.0, RetryPolicy::delay(0, 12.0, static fn(): float => 0.9));
        self::assertSame(0.0, RetryPolicy::delay(3, 0.0, static fn(): float => 0.9));
    }

    public function test_delay_gives_up_rather_than_wait_more_than_a_minute(): void
    {
        self::assertSame(60.0, RetryPolicy::delay(0, 60.0, static fn(): float => 0.0));
        self::assertNull(RetryPolicy::delay(0, 61.0, static fn(): float => 0.0));
        self::assertNull(RetryPolicy::delay(0, 1800.0, static fn(): float => 0.0));
    }
}
