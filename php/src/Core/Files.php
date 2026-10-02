<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * Reading and writing files, with the reason PHP gives when it can't.
 *
 * PHP reports a failed file call with a warning, which an application's error handler may turn into an exception of
 * its own, as Laravel's and Symfony's do. The warning is caught here instead, and its text becomes the reason.
 *
 * @internal
 */
final class Files
{
    /**
     * The file's bytes.
     *
     * @throws \RuntimeException whose message is the reason, when it can't be read
     */
    public static function read(string $path): string
    {
        if (is_dir($path)) {
            throw new \RuntimeException('Is a directory');
        }

        return self::quietly(static fn(): string|false => file_get_contents($path));
    }

    /**
     * Writes the bytes to $path, replacing a file already there.
     *
     * @throws \RuntimeException whose message is the reason, when it can't be written
     */
    public static function write(string $path, string $bytes): void
    {
        $written = self::quietly(static fn(): int|false => file_put_contents($path, $bytes));
        if ($written !== strlen($bytes)) {
            throw new \RuntimeException(sprintf('Only %d of %d bytes were written', $written, strlen($bytes)));
        }
    }

    /**
     * A stream's bytes from its start: it is rewound first when it can seek.
     *
     * @param resource $stream
     *
     * @throws \RuntimeException whose message is the reason, when it can't be read
     */
    public static function fromStart($stream): string
    {
        if (stream_get_meta_data($stream)['seekable']) {
            self::quietly(static fn(): bool => rewind($stream));
        }

        return self::quietly(static fn(): string|false => stream_get_contents($stream));
    }

    /**
     * Runs a file call, and returns what it returns unless that is false: then it throws with PHP's reason. A warning
     * the call raises is caught, so no error handler sees it, and a path PHP refuses outright, such as one holding a
     * NUL byte, throws the same way.
     *
     * @template T
     *
     * @param \Closure(): (T|false) $call
     *
     * @return T
     *
     * @throws \RuntimeException
     */
    private static function quietly(\Closure $call): mixed
    {
        $warning = null;
        set_error_handler(static function (int $level, string $message) use (&$warning): bool {
            $warning ??= $message;

            return true;
        }, E_WARNING | E_NOTICE);
        try {
            $result = $call();
        } catch (\ValueError $error) {
            $warning = $error->getMessage();
            $result = false;
        } finally {
            restore_error_handler();
        }
        if ($result === false) {
            // "file_get_contents(clip.wav): Failed to open stream: No such file or directory", without the call.
            throw new \RuntimeException((string) preg_replace('/^\w+\(.*?\): /', '', $warning ?? 'PHP gave no reason'));
        }

        return $result;
    }
}
