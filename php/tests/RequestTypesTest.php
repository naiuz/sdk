<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Exceptions\NeuronAIException;
use Naiuz\NeuronAI;
use Naiuz\Resources\Account;
use Naiuz\Resources\ApiKeys;
use Naiuz\Resources\Completions;
use Naiuz\Resources\Embeddings;
use Naiuz\Resources\Rerank;
use Naiuz\Resources\Tts;
use Naiuz\Resources\TtsJobs;
use Naiuz\Resources\Voices;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\MockClient;
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
        yield 'SynthesizeDialogueRequest' => [Tts::class, 'SynthesizeDialogueRequest'];
        yield 'ListApiKeysParams' => [ApiKeys::class, 'ListApiKeysParams'];
        yield 'CreateApiKeyRequest' => [ApiKeys::class, 'CreateApiKeyRequest'];
        yield 'UpdateApiKeyRequest' => [ApiKeys::class, 'UpdateApiKeyRequest'];
        yield 'CreateEmbeddingRequest' => [Embeddings::class, 'CreateEmbeddingRequest'];
        yield 'RerankRequest' => [Rerank::class, 'RerankRequest'];
        yield 'CreateChatCompletionRequest' => [Completions::class, 'CreateChatCompletionRequest'];
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
    #[DataProvider('nestedTypes')]
    public function test_each_nested_type_names_the_fields_the_api_documents_marking_the_required_ones(string $class, string $type, string $parent, string $field): void
    {
        $items = Spec::at(Spec::read('openapi.json'), 'components', 'schemas', $parent, 'properties', $field, 'items');
        $properties = Spec::at($items, 'properties');
        self::assertIsArray($properties, "{$parent}.{$field} holds objects");
        $shape = self::shape($class, $type);
        self::assertEqualsCanonicalizing(array_map(strval(...), array_keys($properties)), array_keys($shape));
        self::assertEqualsCanonicalizing(Spec::strings(Spec::at($items, 'required')), array_keys(array_filter($shape)));
    }

    /** @return iterable<string, array{class-string, string, string, string}> */
    public static function nestedTypes(): iterable
    {
        yield 'DialogueTurn' => [Tts::class, 'DialogueTurn', 'SynthesizeDialogueRequest', 'turns'];
    }

    /** @param class-string $class */
    #[DataProvider('requestTypes')]
    public function test_each_method_takes_exactly_the_keys_its_request_type_names(string $class, string $type): void
    {
        $constant = strtoupper((string) preg_replace('/(?<!^)[A-Z]/', '_$0', $type));
        self::assertSame(array_keys(self::shape($class, $type)), (new \ReflectionClassConstant($class, $constant))->getValue());
    }

    /** @return iterable<string, array{string, string, \Closure(NeuronAI, array<string, mixed>): mixed}> */
    public static function checkedCalls(): iterable
    {
        // Each with a camelCase name, as a caller who knows the TypeScript SDK writes it. PHPStan's array shapes let a key
        // they don't name through, so the calls below pass what the types refuse, as an untyped caller would.
        yield 'account->usage' => ['account->usage', 'lastDays', static fn(NeuronAI $client, array $params): mixed => $client->account->usage($params)]; // @phpstan-ignore argument.type
        yield 'voices->list' => ['voices->list', 'voiceType', static fn(NeuronAI $client, array $params): mixed => $client->voices->list($params)]; // @phpstan-ignore argument.type
        yield 'voices->update' => ['voices->update', 'refText', static fn(NeuronAI $client, array $params): mixed => $client->voices->update('v1', $params)]; // @phpstan-ignore argument.type
        yield 'tts->synthesize' => ['tts->synthesize', 'voiceId', static fn(NeuronAI $client, array $params): mixed => $client->tts->synthesize($params)]; // @phpstan-ignore argument.type
        yield 'tts->dialogue' => ['tts->dialogue', 'gapMs', static fn(NeuronAI $client, array $params): mixed => $client->tts->dialogue($params)]; // @phpstan-ignore argument.type
        yield 'tts->jobs->create' => ['tts->jobs->create', 'voiceId', static fn(NeuronAI $client, array $params): mixed => $client->tts->jobs->create($params)]; // @phpstan-ignore argument.type
        yield 'tts->jobs->createAndWait' => ['tts->jobs->create', 'voiceId', static fn(NeuronAI $client, array $params): mixed => $client->tts->jobs->createAndWait($params)]; // @phpstan-ignore argument.type
        yield 'apiKeys->list' => ['apiKeys->list', 'pageSize', static fn(NeuronAI $client, array $params): mixed => $client->apiKeys->list($params)]; // @phpstan-ignore argument.type
        yield 'apiKeys->create' => ['apiKeys->create', 'expiresAt', static fn(NeuronAI $client, array $params): mixed => $client->apiKeys->create($params)]; // @phpstan-ignore argument.type
        yield 'apiKeys->update' => ['apiKeys->update', 'monthlySpendLimit', static fn(NeuronAI $client, array $params): mixed => $client->apiKeys->update('k1', $params)]; // @phpstan-ignore argument.type
        yield 'embeddings->create' => ['embeddings->create', 'encodingFormat', static fn(NeuronAI $client, array $params): mixed => $client->embeddings->create($params)]; // @phpstan-ignore argument.type
        yield 'rerank->create' => ['rerank->create', 'topN', static fn(NeuronAI $client, array $params): mixed => $client->rerank->create($params)]; // @phpstan-ignore argument.type
        yield 'chat->completions->create' => ['chat->completions->create', 'maxTokens', static fn(NeuronAI $client, array $params): mixed => $client->chat->completions->create($params)]; // @phpstan-ignore argument.type
    }

    /** @param \Closure(NeuronAI, array<string, mixed>): mixed $call */
    #[DataProvider('checkedCalls')]
    public function test_each_method_refuses_a_key_its_request_type_doesn_t_name_sending_nothing(string $method, string $key, \Closure $call): void
    {
        $api = new MockClient();
        try {
            $call(Clients::on($api), [$key => 1]);
            self::fail('The key should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertStringStartsWith("{$method}() takes no parameter \"{$key}\": it takes ", $error->getMessage());
        }
        self::assertCount(0, $api);
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
