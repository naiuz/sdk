<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\EventStream;
use PHPUnit\Framework\Attributes\DataProvider;

final class EventStreamTest extends TestCase
{
    public function test_a_blank_line_ends_each_event(): void
    {
        self::assertSame(['{"n":1}', '{"n":2}', '[DONE]'], (new EventStream())->push("data: {\"n\":1}\n\ndata: {\"n\":2}\n\ndata: [DONE]\n\n"));
    }

    #[DataProvider('lineEnds')]
    public function test_a_line_ends_at_crlf_lf_or_cr(string $end): void
    {
        $events = new EventStream();
        // A CR that ends a piece may be half a CRLF: the next piece's first byte settles it.
        self::assertSame(['a', 'b'], [...$events->push("data: a{$end}{$end}data: b{$end}{$end}"), ...$events->push('data: c')]);
    }

    /** @return iterable<string, array{string}> */
    public static function lineEnds(): iterable
    {
        yield 'CRLF' => ["\r\n"];
        yield 'LF' => ["\n"];
        yield 'CR' => ["\r"];
    }

    public function test_an_event_s_data_lines_join_with_a_line_feed(): void
    {
        self::assertSame(["first\nsecond"], (new EventStream())->push("data: first\ndata: second\n\n"));
    }

    public function test_comments_and_other_fields_are_skipped_and_one_space_after_the_colon_is_dropped(): void
    {
        self::assertSame(['x', ' y', ''], (new EventStream())->push(": keep-alive\n\nevent: chunk\nid: 7\ndata:x\n\ndata:  y\n\ndata\n\n"));
    }

    public function test_an_event_split_across_pieces_ends_when_its_blank_line_arrives(): void
    {
        $events = new EventStream();
        $read = [];
        foreach (str_split("data: {\"n\":1}\r\n\r\ndata: [DONE]\r\n\r\n") as $byte) {
            $read = [...$read, ...$events->push($byte)];
        }
        self::assertSame(['{"n":1}', '[DONE]'], $read);
    }

    public function test_a_cr_at_the_end_of_a_piece_waits_for_the_next_one(): void
    {
        $events = new EventStream();
        self::assertSame([], $events->push("data: a\r"));
        self::assertSame(['a'], $events->push("\n\r\n"));
    }

    public function test_an_event_the_stream_s_end_cuts_off_is_never_given(): void
    {
        self::assertSame(['a'], (new EventStream())->push("data: a\n\ndata: {\"cut\":"));
    }
}
