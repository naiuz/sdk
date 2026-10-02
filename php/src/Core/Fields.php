<?php

declare(strict_types=1);

namespace Naiuz\Core;

/**
 * Reads one object of an answer, checking each field's type. A field the API always sends that is missing, or of
 * another type, throws \UnexpectedValueException naming the field, never its value.
 *
 * @internal
 */
final readonly class Fields
{
    private function __construct(private \stdClass $object) {}

    /** @param \stdClass|array<mixed> $data */
    public static function of(\stdClass|array $data): self
    {
        return new self(Json::object($data));
    }

    /** The object as the API sent it. */
    public function object(): \stdClass
    {
        return $this->object;
    }

    public function string(string $name): string
    {
        $value = $this->required($name);

        return is_string($value) ? $value : throw self::invalid($name, 'a string');
    }

    /** A field the API always sends, which may be null. */
    public function nullableString(string $name): ?string
    {
        return $this->required($name) === null ? null : $this->string($name);
    }

    /** A field the API may leave out; null when it does. */
    public function optionalString(string $name): ?string
    {
        return $this->has($name) ? $this->nullableString($name) : null;
    }

    public function int(string $name): int
    {
        $value = $this->required($name);
        if (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) < 2 ** 53) {
            return (int) $value;
        }

        return is_int($value) ? $value : throw self::invalid($name, 'a whole number');
    }

    public function float(string $name): float
    {
        $value = $this->required($name);

        return is_int($value) || is_float($value) ? (float) $value : throw self::invalid($name, 'a number');
    }

    /** A field the API always sends, which may be null. */
    public function nullableFloat(string $name): ?float
    {
        return $this->required($name) === null ? null : $this->float($name);
    }

    public function bool(string $name): bool
    {
        $value = $this->required($name);

        return is_bool($value) ? $value : throw self::invalid($name, 'true or false');
    }

    /** @return list<string> */
    public function strings(string $name): array
    {
        $items = [];
        foreach ($this->list($name) as $item) {
            $items[] = is_string($item) ? $item : throw self::invalid($name, 'a list of strings');
        }

        return $items;
    }

    /** @return list<float> */
    public function floats(string $name): array
    {
        $items = [];
        foreach ($this->list($name) as $item) {
            $items[] = is_int($item) || is_float($item) ? (float) $item : throw self::invalid($name, 'a list of numbers');
        }

        return $items;
    }

    /**
     * A field the API may leave out, holding an object of strings; null when it is left out or null.
     *
     * @return array<string, string>|null
     */
    public function optionalStringMap(string $name): ?array
    {
        $value = $this->has($name) ? $this->object->{$name} : null;
        if ($value === null) {
            return null;
        }
        $map = [];
        foreach ($value instanceof \stdClass ? get_object_vars($value) : throw self::invalid($name, 'an object of strings') as $key => $text) {
            $map[(string) $key] = is_string($text) ? $text : throw self::invalid($name, 'an object of strings');
        }

        return $map;
    }

    /**
     * @template T
     *
     * @param \Closure(\stdClass): T $make
     *
     * @return T
     */
    public function objectOf(string $name, \Closure $make): mixed
    {
        $value = $this->required($name);

        return $value instanceof \stdClass ? $make($value) : throw self::invalid($name, 'an object');
    }

    /**
     * A field the API always sends, which may be null.
     *
     * @template T
     *
     * @param \Closure(\stdClass): T $make
     *
     * @return T|null
     */
    public function nullableObjectOf(string $name, \Closure $make): mixed
    {
        return $this->required($name) === null ? null : $this->objectOf($name, $make);
    }

    /**
     * A field the API may leave out; null when it does.
     *
     * @template T
     *
     * @param \Closure(\stdClass): T $make
     *
     * @return T|null
     */
    public function optionalObjectOf(string $name, \Closure $make): mixed
    {
        return $this->has($name) ? $this->nullableObjectOf($name, $make) : null;
    }

    /**
     * @template T
     *
     * @param \Closure(\stdClass): T $make
     *
     * @return list<T>
     */
    public function listOf(string $name, \Closure $make): array
    {
        $items = [];
        foreach ($this->list($name) as $item) {
            $items[] = $item instanceof \stdClass ? $make($item) : throw self::invalid($name, 'a list of objects');
        }

        return $items;
    }

    /** @return list<mixed> */
    private function list(string $name): array
    {
        $value = $this->required($name);

        return is_array($value) && array_is_list($value) ? $value : throw self::invalid($name, 'a list');
    }

    private function has(string $name): bool
    {
        return property_exists($this->object, $name);
    }

    private function required(string $name): mixed
    {
        return $this->has($name) ? $this->object->{$name} : throw new \UnexpectedValueException("The field \"{$name}\" is missing.");
    }

    private static function invalid(string $name, string $what): \UnexpectedValueException
    {
        return new \UnexpectedValueException("The field \"{$name}\" must be {$what}.");
    }
}
