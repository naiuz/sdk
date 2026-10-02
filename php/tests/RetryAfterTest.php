<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\RetryAfter;
use PHPUnit\Framework\Attributes\DataProvider;

final class RetryAfterTest extends TestCase
{
    /** Tue, 29 Sep 2026 10:00:00 GMT. */
    private const NOW = 1790676000.0;

    public function test_it_reads_seconds(): void
    {
        self::assertSame(12.0, RetryAfter::parse('12', self::NOW));
        self::assertSame(0.0, RetryAfter::parse(' 0 ', self::NOW));
        self::assertSame(1.5, RetryAfter::parse('1.5', self::NOW));
    }

    public function test_it_reads_an_http_date_as_the_seconds_from_now_rounded_up(): void
    {
        self::assertSame(30.0, RetryAfter::parse('Tue, 29 Sep 2026 10:00:30 GMT', self::NOW));
        self::assertSame(30.0, RetryAfter::parse('Tue, 29 Sep 2026 10:00:30 GMT', self::NOW + 0.5));
        self::assertSame(1800.0, RetryAfter::parse('Tue, 29 Sep 2026 10:30:00 GMT', self::NOW));
    }

    public function test_it_reads_the_obsolete_date_forms_http_still_allows(): void
    {
        self::assertSame(30.0, RetryAfter::parse('Tuesday, 29-Sep-26 10:00:30 GMT', self::NOW));
        self::assertSame(30.0, RetryAfter::parse('Tue Sep 29 10:00:30 2026', self::NOW));
    }

    public function test_it_never_gives_less_than_0_for_a_date_already_past(): void
    {
        self::assertSame(0.0, RetryAfter::parse('Tue, 29 Sep 2026 09:59:00 GMT', self::NOW));
    }

    #[DataProvider('unreadable')]
    public function test_it_gives_null_for_no_header_or_one_it_can_t_read(?string $value): void
    {
        self::assertNull(RetryAfter::parse($value, self::NOW));
    }

    /** @return iterable<string, array{?string}> */
    public static function unreadable(): iterable
    {
        foreach ([null, '', 'soon', '-1', '12s', '1e3', 'Tue, 99 Foo 2026', 'Wed'] as $value) {
            yield var_export($value, true) => [$value];
        }
    }
}
