<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Resources\Account;
use Naiuz\Resources\ApiKeys;
use Naiuz\Resources\TtsJobs;
use Naiuz\Resources\Voices;
use Naiuz\Tests\Support\Spec;
use PHPUnit\Framework\Attributes\DataProvider;

final class RequestTypesTest extends TestCase
{
    /** The request types that are an operation's query, not a schema of the document. */
    private const QUERIES = ['ListVoicesParams' => '/v1/tts/voices', 'ListApiKeysParams' => '/v1/api-keys', 'UsageParams' => '/v1/usage'];

    /** @return iterable<string, array{class-string, string}> */
    public static function requestTypes(): iterable
    {
        yield 'UsageParams' => [Account::class, 'UsageParams'];
        yield 'ListVoicesParams' => [Voices::class, 'ListVoicesParams'];
        yield 'UpdateVoiceRequest' => [Voices::class, 'UpdateVoiceRequest'];
        yield 'SynthesizeSpeechRequest' => [TtsJobs::class, 'SynthesizeSpeechRequest'];
        yield 'ListApiKeysParams' => [ApiKeys::class, 'ListApiKeysParams'];
        yield 'CreateApiKeyRequest' => [ApiKeys::class, 'CreateApiKeyRequest'];
        yield 'UpdateApiKeyRequest' => [ApiKeys::class, 'UpdateApiKeyRequest'];
    }

    /** @param class-string $class */
    #[DataProvider('requestTypes')]
    public function test_each_request_type_names_the_fields_the_api_documents_marking_the_required_ones(string $class, string $type): void
    {
        [$documented, $required] = self::documented($type);
        $shape = self::shape($class, $type);
        self::assertEqualsCanonicalizing($documented, array_keys($shape));
        self::assertEqualsCanonicalizing($required, array_keys(array_filter($shape)));
    }

    /** @param class-string $class */
    #[DataProvider('requestTypes')]
    public function test_each_method_takes_exactly_the_keys_its_request_type_names(string $class, string $type): void
    {
        $constant = strtoupper((string) preg_replace('/(?<!^)[A-Z]/', '_$0', $type));
        self::assertSame(array_keys(self::shape($class, $type)), (new \ReflectionClassConstant($class, $constant))->getValue());
    }

    /**
     * The top-level keys of a `@phpstan-type` array shape in a class's docblock, each true when it is required.
     *
     * @param class-string $class
     *
     * @return array<string, bool>
     */
    private static function shape(string $class, string $type): array
    {
        $doc = (string) (new \ReflectionClass($class))->getDocComment();
        self::assertSame(1, preg_match('/@phpstan-type ' . $type . ' array\{(.*)\}$/m', $doc, $match), "{$class} defines {$type}");
        $keys = [];
        $depth = 0;
        $part = '';
        foreach (str_split($match[1] . ',') as $character) {
            $depth += match ($character) {
                '{', '<', '(' => 1,
                '}', '>', ')' => -1,
                default => 0,
            };
            if ($character === ',' && $depth === 0) {
                $name = trim(explode(':', $part, 2)[0]);
                $keys[rtrim($name, '?')] = !str_ends_with($name, '?');
                $part = '';
            } else {
                $part .= $character;
            }
        }

        return $keys;
    }

    /**
     * The fields the API document gives a request type, and those it requires: a request schema's properties, or an
     * operation's query parameters.
     *
     * @return array{list<string>, list<string>}
     */
    private static function documented(string $type): array
    {
        $document = Spec::read('openapi.json');
        if (isset(self::QUERIES[$type])) {
            $parameters = Spec::at($document, 'paths', self::QUERIES[$type], 'get', 'parameters');
            self::assertIsArray($parameters);
            $names = [];
            foreach ($parameters as $parameter) {
                if (Spec::at($parameter, 'in') === 'query') {
                    $names = [...$names, ...Spec::strings([Spec::at($parameter, 'name')])];
                }
            }

            return [$names, []];
        }
        $properties = Spec::at($document, 'components', 'schemas', $type, 'properties');
        self::assertIsArray($properties, "{$type} is a schema of the document");

        return [array_map(strval(...), array_keys($properties)), Spec::strings(Spec::at($document, 'components', 'schemas', $type, 'required'))];
    }
}
