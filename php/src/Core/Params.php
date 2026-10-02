<?php

declare(strict_types=1);

namespace Naiuz\Core;

use Naiuz\Exceptions\NeuronAIException;

/**
 * The checks on what a method is given: its fields or its query, as an array keyed by the API's own names.
 *
 * @internal
 */
final class Params
{
    /**
     * The array, once each of its keys is one the method takes: another, such as a typo or a camelCase name, throws
     * NeuronAIException before anything is sent, since the API would ignore it. Its values go as given: a key left out
     * is not sent, and a null is sent as null.
     *
     * @param array<mixed> $params
     * @param list<string> $known
     *
     * @return array<string, mixed>
     */
    public static function check(string $method, array $params, array $known): array
    {
        $checked = [];
        foreach ($params as $name => $value) {
            if (!in_array($name, $known, true)) {
                throw new NeuronAIException(sprintf('%s() takes no parameter "%s": it takes %s.', $method, $name, self::listing($known, 'and')));
            }
            $checked[(string) $name] = $value;
        }

        return $checked;
    }

    /**
     * Names in prose: "a, b and c".
     *
     * @param list<string> $names
     */
    public static function listing(array $names, string $last): string
    {
        $final = array_pop($names);

        return $names === [] ? (string) $final : implode(', ', $names) . " {$last} {$final}";
    }
}
