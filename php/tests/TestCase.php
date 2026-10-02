<?php

declare(strict_types=1);

namespace Naiuz\Tests;

/**
 * The base of every test. A developer's own NEURONAI_* variables never reach a test, and a variable a test sets
 * doesn't outlive it.
 */
abstract class TestCase extends \PHPUnit\Framework\TestCase
{
    private const VARIABLES = ['NEURONAI_API_KEY', 'NEURONAI_BASE_URL'];

    /** @var array<string, array{string|false, mixed, mixed}> */
    private array $saved = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (self::VARIABLES as $name) {
            $this->saved[$name] = [getenv($name), $_ENV[$name] ?? null, $_SERVER[$name] ?? null];
            putenv($name);
            unset($_ENV[$name], $_SERVER[$name]);
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->saved as $name => [$fromGetenv, $fromEnv, $fromServer]) {
            putenv($fromGetenv === false ? $name : "{$name}={$fromGetenv}");
            unset($_ENV[$name], $_SERVER[$name]);
            if ($fromEnv !== null) {
                $_ENV[$name] = $fromEnv;
            }
            if ($fromServer !== null) {
                $_SERVER[$name] = $fromServer;
            }
        }
        parent::tearDown();
    }

    /** Sets an environment variable for this test only, where getenv(), $_ENV and $_SERVER each see it. */
    protected static function setVariable(string $name, string $value): void
    {
        putenv("{$name}={$value}");
        $_ENV[$name] = $value;
        $_SERVER[$name] = $value;
    }
}
