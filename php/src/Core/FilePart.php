<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * A file ready to send: its filename, its bytes, and the content type to declare for it.
 *
 * @internal
 */
final readonly class FilePart
{
    public function __construct(public string $filename, public string $content, public string $contentType) {}
}
