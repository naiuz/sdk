<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

use PHPUnit\Framework\Assert;
use Psr\Http\Message\RequestInterface;

/**
 * Reads a sent multipart form as RFC 7578 frames one, apart from how the SDK writes it.
 */
final class FormParser
{
    /**
     * A request's form in the fixtures' `{fields, files}` shape: each `name[]` part's text goes into a list under
     * `name`, and each file is its filename, content type and bytes in base64. A body that isn't a well-formed form, a
     * content type without its boundary, or a part sent twice under one name fails the test.
     *
     * @return array{fields: array<string, string|list<string>>, files: array<string, array{filename: string, content_type: string, base64: string}>}
     */
    public static function parse(RequestInterface $request): array
    {
        Assert::assertSame(1, preg_match('~^multipart/form-data; boundary=([0-9A-Za-z\'()+_,./:=?-]{1,70})$~', $request->getHeaderLine('content-type'), $match), 'The content type names the boundary.');
        $delimiter = "--{$match[1]}";
        $body = (string) $request->getBody();
        $fields = [];
        $lists = [];
        $files = [];
        if ($body !== "{$delimiter}--\r\n") {
            Assert::assertStringStartsWith("{$delimiter}\r\n", $body, 'The body starts with the boundary.');
            Assert::assertStringEndsWith("\r\n{$delimiter}--\r\n", $body, 'The body ends with the closing boundary.');
            $inner = substr($body, strlen("{$delimiter}\r\n"), -strlen("\r\n{$delimiter}--\r\n"));
            foreach (explode("\r\n{$delimiter}\r\n", $inner) as $part) {
                [$head, $content] = self::split($part);
                $disposition = $head['content-disposition'] ?? '';
                Assert::assertSame(1, preg_match('/^form-data; name="([^"\r\n]*)"(?:; filename="([^"\r\n]*)")?$/', $disposition, $named), "A part's disposition names it: {$disposition}");
                $name = $named[1];
                if (isset($named[2])) {
                    Assert::assertArrayNotHasKey($name, $files, "The file {$name} is sent once.");
                    $files[$name] = ['filename' => $named[2], 'content_type' => $head['content-type'] ?? '', 'base64' => base64_encode($content)];
                } elseif (str_ends_with($name, '[]')) {
                    $lists[substr($name, 0, -2)][] = $content;
                } else {
                    Assert::assertArrayNotHasKey($name, $fields, "The field {$name} is sent once.");
                    $fields[$name] = $content;
                }
            }
        }
        Assert::assertSame([], array_intersect_key($fields, $lists), 'A field is sent as a list or as text, not both.');

        return ['fields' => [...$fields, ...$lists], 'files' => $files];
    }

    /**
     * A part's headers, by lower-case name, and its content.
     *
     * @return array{array<string, string>, string}
     */
    private static function split(string $part): array
    {
        $end = strpos($part, "\r\n\r\n");
        Assert::assertNotFalse($end, 'A part has its headers, a blank line, then its content.');
        $head = [];
        foreach (explode("\r\n", substr($part, 0, $end)) as $line) {
            Assert::assertSame(1, preg_match('/^([!#$%&\'*+.^_`|~0-9A-Za-z-]+): ?(.*)$/', $line, $header), "A part's header line: {$line}");
            $head[strtolower($header[1])] = $header[2];
        }

        return [$head, substr($part, $end + 4)];
    }
}
