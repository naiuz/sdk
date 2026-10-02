<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * JSON as the SDK sends and keeps it.
 *
 * @internal
 */
final class Json
{
    private const FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;

    /**
     * The value as compact UTF-8 JSON. A value JSON can't carry, such as NAN, a resource or text that isn't UTF-8,
     * throws NeuronAIException naming the problem.
     */
    public static function encode(mixed $value): string
    {
        try {
            return json_encode($value, self::FLAGS | JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            $problem = $error->getMessage();
        }

        throw new NeuronAIException("The request can't be sent as JSON: {$problem}.");
    }

    /** The JSON text's value, with each object as a \stdClass, or null when the text isn't JSON. */
    public static function decode(string $text): mixed
    {
        try {
            return json_decode($text, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
    }

    /**
     * An object as a \stdClass tree, the way decode() gives one: a PHP array with a key that isn't a list's becomes a
     * \stdClass, at any depth, and the top level is always one.
     *
     * @param \stdClass|array<mixed> $data
     */
    public static function object(\stdClass|array $data): \stdClass
    {
        $object = new \stdClass();
        foreach ((array) $data as $name => $value) {
            $object->{$name} = self::tree($value);
        }

        return $object;
    }

    private static function tree(mixed $value): mixed
    {
        if ($value instanceof \stdClass || (is_array($value) && !array_is_list($value))) {
            return self::object($value);
        }

        return is_array($value) ? array_map(self::tree(...), $value) : $value;
    }
}
