<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

/**
 * A userland stream wrapper that opens nothing, as an S3 client's wrapper refuses a key it may not read: it says why
 * with E_USER_WARNING, then fails. Register it as `naiuz-denied`.
 */
final class DeniedStream
{
    public const PROTOCOL = 'naiuz-denied';

    /** @var resource|null The context PHP hands every wrapper. */
    public $context;

    public function stream_open(string $path, string $mode, int $options, ?string &$openedPath): bool
    {
        trigger_error(self::denied($path), E_USER_WARNING);

        return false;
    }

    /** @return false A file it may not read is one it can't see, and is_dir() asks quietly. */
    public function url_stat(string $path, int $flags): false
    {
        if (($flags & STREAM_URL_STAT_QUIET) === 0) {
            trigger_error(self::denied($path), E_USER_WARNING);
        }

        return false;
    }

    private static function denied(string $path): string
    {
        return 'Access denied to ' . substr($path, strlen(self::PROTOCOL . '://'));
    }
}
