<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * A call's multipart form, before it is encoded: its fields by name, and the names of those that are files.
 *
 * @internal
 */
final readonly class Form
{
    /**
     * @param array<string, mixed> $fields Each field as the caller gave it; a file as Upload reads one.
     * @param list<string> $files The names of the fields that are files.
     */
    public function __construct(public array $fields, public array $files) {}
}
