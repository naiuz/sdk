<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * Splits a stream of server-sent events into each event's data, as the HTML standard parses one.
 *
 * A line ends at CRLF, LF or CR. Each `data` field adds a line to the event's data, and a blank line ends the event.
 * Comments and other fields are skipped. An event the stream's end cuts off is dropped.
 *
 * @internal
 */
final class EventStream
{
    /** The text of a line not ended yet. */
    private string $pending = '';

    /** @var list<string> The data lines of the event not ended yet. */
    private array $data = [];

    /**
     * Takes the next piece of the stream, and returns the data of each event it ends.
     *
     * @return list<string>
     */
    public function push(string $piece): array
    {
        $this->pending .= $piece;
        $events = [];
        $offset = 0;
        while (preg_match('/\r\n|\r|\n/', $this->pending, $match, PREG_OFFSET_CAPTURE, $offset) === 1) {
            [$end, $at] = $match[0];
            // A CR at the very end may be the first half of a CRLF: wait for the next piece.
            if ($end === "\r" && $at === strlen($this->pending) - 1) {
                break;
            }
            $line = substr($this->pending, $offset, $at - $offset);
            $offset = $at + strlen($end);
            if ($line === '') {
                if ($this->data !== []) {
                    $events[] = implode("\n", $this->data);
                }
                $this->data = [];
            } elseif ($line === 'data' || str_starts_with($line, 'data:')) {
                $value = substr($line, 5);
                $this->data[] = str_starts_with($value, ' ') ? substr($value, 1) : $value;
            }
        }
        $this->pending = substr($this->pending, $offset);

        return $events;
    }
}
