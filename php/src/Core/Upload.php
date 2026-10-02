<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * A file to upload, as a caller passes one, read whole with the filename and content type to send it with.
 *
 * A file is one of these, and its filename's extension names its format:
 * - a path, as a string: the file is read, and sent under its last part, such as `clip.wav`;
 * - a stream with its filename, `['stream' => $stream, 'filename' => 'clip.wav']`, and optionally the content type to
 *   declare, `'content_type' => 'audio/wav'`. The stream is read from its start: it is rewound when it can seek, and
 *   refused when it can't and has been read from.
 *
 * Unless the caller declares one, the content type comes from the filename's extension: `wav` is `audio/wav`, `mp3`
 * `audio/mpeg`, `ogg` `audio/ogg`, `flac` `audio/flac`, `m4a` `audio/mp4`, `webm` `audio/webm`, and anything else
 * `application/octet-stream`. The server checks a file by its content, so the declared type never decides whether it
 * is accepted.
 *
 * @phpstan-type FileUpload array{stream: resource, filename: string, content_type?: string|null}
 * @phpstan-type Uploadable string|FileUpload
 *
 * @internal
 */
final class Upload
{
    /** The content type each upload extension names, the same in every NeuronAI SDK. */
    private const CONTENT_TYPES = ['wav' => 'audio/wav', 'mp3' => 'audio/mpeg', 'ogg' => 'audio/ogg', 'flac' => 'audio/flac', 'm4a' => 'audio/mp4', 'webm' => 'audio/webm'];

    /** The keys of a stream's form. */
    private const KEYS = ['stream', 'filename', 'content_type'];

    /** What a file can be, as the messages say it. */
    private const FORMS = "a path, or ['stream' => \$stream, 'filename' => 'clip.wav']";

    /**
     * The content type a filename's extension names. The extension is what follows the last dot, in lower case. One the
     * table doesn't hold, or none at all, gives `application/octet-stream`.
     */
    public static function contentTypeFor(string $filename): string
    {
        $dot = strrpos($filename, '.');

        return $dot === false ? 'application/octet-stream' : self::CONTENT_TYPES[strtolower(substr($filename, $dot + 1))] ?? 'application/octet-stream';
    }

    /**
     * The file a caller passed as $field, read whole, with the filename and the content type to send it with.
     *
     * A stream alone, a stream without a filename or with an empty one, a string that can't be a path, such as the
     * file's own bytes, and anything else that isn't one of the forms throw NeuronAIException before anything is sent,
     * saying what to pass. So does a file or a stream that can't be read.
     */
    public static function read(string $field, mixed $value): FilePart
    {
        if (is_string($value)) {
            return self::fromPath($field, $value);
        }
        if (is_array($value)) {
            return self::fromStream($field, $value);
        }
        if (is_resource($value)) {
            throw new NeuronAIException("{$field} needs a filename: pass ['stream' => \$stream, 'filename' => 'clip.wav'] rather than the stream alone.");
        }

        throw new NeuronAIException("{$field} must be " . self::FORMS . '.');
    }

    private static function fromPath(string $field, string $path): FilePart
    {
        // A path names a file: a string with a NUL byte, past the longest path, or not text is the file's bytes instead.
        if ($path === '' || str_contains($path, "\0") || strlen($path) > PHP_MAXPATHLEN || preg_match('//u', $path) !== 1) {
            throw new NeuronAIException("{$field} must be " . self::FORMS . ": this string isn't a path. To upload bytes you hold, write them to a stream, such as fopen('php://temp', 'w+b'), and pass it with a filename.");
        }
        try {
            $content = Files::read($path);
        } catch (\RuntimeException $error) {
            throw new NeuronAIException("{$field} couldn't be read from {$path}: {$error->getMessage()}");
        }
        $filename = basename($path);

        return new FilePart($filename, $content, self::contentTypeFor($filename));
    }

    /** @param array<mixed> $upload */
    private static function fromStream(string $field, array $upload): FilePart
    {
        foreach (array_keys($upload) as $key) {
            if (!in_array($key, self::KEYS, true)) {
                throw new NeuronAIException(sprintf('%s takes no key "%s": it takes stream, filename and content_type.', $field, $key));
            }
        }
        $stream = $upload['stream'] ?? null;
        $filename = $upload['filename'] ?? null;
        $declared = $upload['content_type'] ?? null;
        if (!is_resource($stream) || get_resource_type($stream) !== 'stream') {
            throw new NeuronAIException("{$field}'s stream must be an open stream, such as fopen(\$path, 'rb').");
        }
        if (!is_string($filename) || $filename === '') {
            throw new NeuronAIException("{$field} needs a filename, such as 'clip.wav': its extension names the file's format.");
        }
        if ($declared !== null && (!is_string($declared) || preg_match('/^[\t\x20-\x7e]*\z/', $declared) !== 1)) {
            throw new NeuronAIException("{$field}'s content_type must be text a header can carry, such as 'audio/wav'.");
        }
        $mode = stream_get_meta_data($stream)['mode'];
        if (!str_contains($mode, 'r') && !str_contains($mode, '+')) {
            throw new NeuronAIException("{$field}'s stream is open for writing only: open it for reading, such as fopen(\$path, 'rb').");
        }
        if (!stream_get_meta_data($stream)['seekable'] && ftell($stream) !== 0) {
            throw new NeuronAIException("{$field}'s stream has been read from, and can't be rewound to its start: pass it unread, or pass a path.");
        }
        try {
            $content = Files::fromStart($stream);
        } catch (\RuntimeException $error) {
            throw new NeuronAIException("{$field}'s stream couldn't be read: {$error->getMessage()}");
        }
        $declared = trim($declared ?? '', " \t");

        return new FilePart($filename, $content, $declared !== '' ? $declared : self::contentTypeFor($filename));
    }
}
