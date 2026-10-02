<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * A call's form as a multipart/form-data body, encoded once before the first attempt, so every attempt sends the
 * same bytes.
 *
 * Each part is written as a browser writes one: `Content-Disposition: form-data; name="…"`, plus `filename="…"` and a
 * `Content-Type` line on a file part. In names and filenames, `"`, CR and LF go as `%22`, `%0D` and `%0A`.
 *
 * @internal
 */
final class Multipart
{
    /**
     * The body of a call's form, and its content type, which names the boundary.
     *
     * Each field named in $form->files goes as a file part, read here, once (Upload::read()). A list goes as one `name[]`
     * part per item, and any other field as text: a string with each line break as CRLF, as an HTML form sends it, a
     * backed enum as its value, and any other value as JSON, such as `2` or `true`. A null field is left out, since a
     * form has no null, and an empty list sends no part. The boundary is random, unless a test gives one.
     *
     * @return array{string, string}
     */
    public static function encode(Form $form, ?string $boundary = null): array
    {
        $boundary ??= bin2hex(random_bytes(16));
        // The parts are joined once at the end: a file's bytes are copied into the body once, and never again.
        $parts = [];
        foreach ($form->fields as $name => $value) {
            if ($value === null) {
                continue;
            }
            if (in_array($name, $form->files, true)) {
                $file = Upload::read($name, $value);
                $parts[] = self::head($boundary, sprintf('name="%s"; filename="%s"', self::escape($name), self::escape($file->filename)), "Content-Type: {$file->contentType}\r\n");
                $parts[] = $file->content;
                $parts[] = "\r\n";
            } elseif (is_array($value) && array_is_list($value)) {
                foreach ($value as $item) {
                    $parts[] = self::text($boundary, "{$name}[]", $item);
                }
            } else {
                $parts[] = self::text($boundary, $name, $value);
            }
        }
        $parts[] = "--{$boundary}--\r\n";

        return [implode('', $parts), "multipart/form-data; boundary={$boundary}"];
    }

    /** A text part: a string with each line break, CR, LF or CRLF, sent as CRLF (D16); anything else as its text. */
    private static function text(string $boundary, string $name, mixed $value): string
    {
        $text = match (true) {
            is_string($value) => str_replace("\n", "\r\n", str_replace(["\r\n", "\r"], "\n", $value)),
            $value instanceof \BackedEnum => (string) $value->value,
            default => Json::encode($value),
        };

        return self::head($boundary, sprintf('name="%s"', self::escape($name))) . $text . "\r\n";
    }

    private static function head(string $boundary, string $disposition, string $headers = ''): string
    {
        return "--{$boundary}\r\nContent-Disposition: form-data; {$disposition}\r\n{$headers}\r\n";
    }

    private static function escape(string $text): string
    {
        return str_replace(['"', "\r", "\n"], ['%22', '%0D', '%0A'], $text);
    }
}
