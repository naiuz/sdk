<?php

declare(strict_types=1);

namespace Naiuz\Types;

use Naiuz\Core\Json;

/**
 * The base of every object the API returns.
 *
 * Its typed properties hold the fields the SDK knows. toArray() and json_encode() give the object exactly as the API
 * sent it: every field it held, one the SDK doesn't know yet included, a null as null, and nothing the SDK attached,
 * such as request_id or cost.
 */
abstract readonly class ApiObject implements \JsonSerializable
{
    /** The object as the API sent it, as JSON, so nothing can change it. */
    private string $json;

    protected function __construct(\stdClass $sent)
    {
        $this->json = Json::encode($sent);
    }

    /**
     * The object as the API sent it, as arrays. An empty object becomes an empty array, as PHP arrays have no other
     * way to hold one: json_encode() keeps it as {}.
     *
     * @return array<string, mixed>
     */
    final public function toArray(): array
    {
        $fields = [];
        foreach ((array) json_decode($this->json, true, 512, JSON_THROW_ON_ERROR) as $name => $value) {
            $fields[(string) $name] = $value;
        }

        return $fields;
    }

    /** The object exactly as the API sent it, for json_encode(). */
    final public function jsonSerialize(): \stdClass
    {
        $object = json_decode($this->json, false, 512, JSON_THROW_ON_ERROR);

        return $object instanceof \stdClass ? $object : new \stdClass();
    }
}
