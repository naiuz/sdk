<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

/**
 * What an error tracker can record of an exception.
 */
final class Frames
{
    /**
     * The frames of the SDK's own code that an exception, and each it was thrown from, passed through, with the
     * arguments each call was given.
     *
     * @return list<array{function: string, class?: class-string, args?: array<mixed>}>
     */
    public static function sdk(\Throwable $error): array
    {
        $frames = [];
        for ($current = $error; $current !== null; $current = $current->getPrevious()) {
            foreach ($current->getTrace() as $frame) {
                $class = $frame['class'] ?? '';
                if (str_starts_with($class, 'Naiuz\\') && !str_starts_with($class, 'Naiuz\\Tests\\')) {
                    $frames[] = $frame;
                }
            }
        }

        return $frames;
    }

    /**
     * What an error tracker or a log can print of an exception that the SDK controls: each message in its chain, its
     * public properties, and every argument of each frame of the SDK's own code, printed in full. The caller's own
     * frames hold the caller's own arguments, so they are left out.
     */
    public static function printed(\Throwable $error): string
    {
        $printed = [];
        for ($current = $error; $current !== null; $current = $current->getPrevious()) {
            $printed[] = $current::class . ': ' . $current->getMessage();
            $printed[] = print_r(get_object_vars($current), true);
        }
        $printed[] = print_r(array_map(static fn(array $frame): array => $frame['args'] ?? [], self::sdk($error)), true);

        return implode("\n", $printed);
    }
}
