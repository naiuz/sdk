<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use Psr\Http\Message\StreamInterface;

/**
 * A body that arrives over time: each piece after `gap` seconds, then it ends, fails with `error` a gap later, or goes
 * on with `forever`. It records whether it was closed and whether it was read to its end.
 */
final class DripStream implements StreamInterface
{
    /** Seconds after which a body that goes on forever fails the test, so a client that never cuts it off can't hang the suite. */
    public const GIVE_UP = 5.0;

    /** Whether the client closed the body. */
    public bool $closed = false;

    /** Whether the client read the body to its end. */
    public bool $finished = false;

    private int $next = 0;

    private ?float $started = null;

    /** @param list<string> $pieces */
    public function __construct(private readonly array $pieces, private readonly float $gap = 0.0, private readonly bool $forever = false, private ?\Throwable $error = null) {}

    public function read(int $length): string
    {
        $this->started ??= microtime(true);
        if ($this->next < count($this->pieces)) {
            usleep((int) ($this->gap * 1_000_000));

            return $this->pieces[$this->next++];
        }
        if ($this->forever) {
            if (microtime(true) - $this->started > self::GIVE_UP) {
                // An \Error: PHPUnit's own failure is a \RuntimeException, which the SDK reads as a failed read, and so as
                // the very timeout the test waits for.
                throw new \Error(sprintf('The body dripped for %d s: nothing cut it off.', self::GIVE_UP));
            }
            usleep((int) ($this->gap * 1_000_000));

            return ' ';
        }
        if ($this->error !== null) {
            $error = $this->error;
            $this->error = null;
            usleep((int) ($this->gap * 1_000_000));

            throw $error;
        }

        return '';
    }

    public function eof(): bool
    {
        $this->finished = $this->next >= count($this->pieces) && !$this->forever && $this->error === null;

        return $this->finished;
    }

    public function close(): void
    {
        $this->closed = true;
    }

    public function __toString(): string
    {
        return $this->getContents();
    }

    public function getContents(): string
    {
        $content = '';
        while (!$this->eof()) {
            $content .= $this->read(8192);
        }

        return $content;
    }

    public function detach()
    {
        return null;
    }

    public function getSize(): ?int
    {
        return null;
    }

    public function tell(): int
    {
        return 0;
    }

    public function isSeekable(): bool
    {
        return false;
    }

    public function seek(int $offset, int $whence = SEEK_SET): void
    {
        throw new \RuntimeException('The body can\'t seek.');
    }

    public function rewind(): void
    {
        throw new \RuntimeException('The body can\'t seek.');
    }

    public function isWritable(): bool
    {
        return false;
    }

    public function write(string $string): int
    {
        throw new \RuntimeException('The body can\'t be written.');
    }

    public function isReadable(): bool
    {
        return true;
    }

    public function getMetadata(?string $key = null)
    {
        return $key === null ? [] : null;
    }
}
