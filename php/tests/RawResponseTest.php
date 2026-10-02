<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\NeuronAI;
use Naiuz\NeuronAIWithRawResponse;
use Naiuz\RawResponse;

final class RawResponseTest extends TestCase
{
    public function test_every_resource_has_a_twin_whose_methods_take_the_same_arguments_and_return_a_raw_response(): void
    {
        $resources = array_map(static fn(string $path): string => 'Naiuz\\Resources\\' . basename($path, '.php'), glob(__DIR__ . '/../src/Resources/*.php') ?: []);
        $plain = array_values(array_filter($resources, static fn(string $class): bool => !str_ends_with($class, 'WithRawResponse')));
        self::assertNotSame([], $plain);
        foreach ($plain as $class) {
            $twin = $class . 'WithRawResponse';
            if (!class_exists($class) || !class_exists($twin)) {
                self::fail("{$class} has no twin {$twin}");
            }
            self::assertSame(self::methods($class), self::methods($twin), $twin);
            self::assertSame(self::properties($class), self::properties($twin), $twin);
            foreach ((new \ReflectionClass($twin))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
                if (!$method->isConstructor()) {
                    self::assertSame(RawResponse::class, (string) $method->getReturnType(), "{$twin}::{$method->name}");
                }
            }
        }
    }

    public function test_the_raw_client_has_a_twin_of_every_resource_of_the_client(): void
    {
        self::assertSame(self::properties(NeuronAI::class, ['base_url', 'timeout', 'max_retries']), self::properties(NeuronAIWithRawResponse::class));
    }

    /**
     * Each public method other than the constructor, with its parameters' names, types and defaults.
     *
     * @param class-string $class
     *
     * @return array<string, list<string>>
     */
    private static function methods(string $class): array
    {
        $methods = [];
        foreach ((new \ReflectionClass($class))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            if (!$method->isConstructor()) {
                $methods[$method->name] = array_map(
                    static fn(\ReflectionParameter $parameter): string => sprintf('%s $%s%s', $parameter->getType(), $parameter->name, $parameter->isDefaultValueAvailable() ? ' = ' . var_export($parameter->getDefaultValue(), true) : ''),
                    $method->getParameters(),
                );
            }
        }
        ksort($methods);

        return $methods;
    }

    /**
     * The public properties that hold resources, by name.
     *
     * @param class-string $class
     * @param list<string> $leaveOut
     *
     * @return list<string>
     */
    private static function properties(string $class, array $leaveOut = []): array
    {
        $names = array_map(static fn(\ReflectionProperty $property): string => $property->name, (new \ReflectionClass($class))->getProperties(\ReflectionProperty::IS_PUBLIC));

        return array_values(array_diff($names, $leaveOut));
    }
}
