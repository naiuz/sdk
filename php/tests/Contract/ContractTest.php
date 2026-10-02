<?php

declare(strict_types=1);

namespace Naiuz\Tests\Contract;

use GuzzleHttp\Psr7\Request;
use Naiuz\Core\ErrorFactory;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\Spec;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Tests\TestCase;
use Naiuz\Types\Voice;
use PHPUnit\Framework\AssertionFailedError;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;

final class ContractTest extends TestCase
{
    private const EXPECTED = [
        'method' => 'GET',
        'path' => '/tts/voices/O%27zbek',
        'query' => ['limit' => '3'],
        'headers' => ['authorization' => 'Bearer ' . Harness::FIXTURE_KEY],
        'body' => null,
    ];

    private const BODY_EXPECTED = [
        'method' => 'PATCH',
        'path' => '/api-keys/key_1',
        'headers' => ['authorization' => 'Bearer ' . Harness::FIXTURE_KEY],
        'body' => ['json' => ['name' => 'Ops', 'limit' => 1, 'enabled' => true]],
    ];

    /** @return iterable<string, array{string}> */
    public static function replayable(): iterable
    {
        foreach (array_diff(Harness::fixtures(), Harness::DEFERRED_FIXTURES) as $file) {
            yield $file => [$file];
        }
    }

    /** @return iterable<string, array{string}> */
    public static function deferred(): iterable
    {
        foreach (Harness::DEFERRED_FIXTURES as $file) {
            yield $file => [$file];
        }
    }

    /** @return iterable<string, array{string}> */
    public static function errors(): iterable
    {
        foreach (Harness::fixtures() as $file) {
            if ((int) Spec::text(Spec::at(Harness::load($file), 'response', 'status')) >= 400) {
                yield $file => [$file];
            }
        }
    }

    /** @return iterable<string, array{string}> */
    public static function phpPaths(): iterable
    {
        foreach (Harness::phpPaths() as $path) {
            yield $path => [$path];
        }
    }

    #[DataProvider('replayable')]
    public function test_a_fixture_sends_its_request_and_returns_its_result(string $file): void
    {
        $fixture = Harness::load($file);
        $replayed = Harness::replay($fixture);
        Harness::expectRequest($replayed->requests, (array) Spec::at($fixture, 'request'));
        self::assertSame(Harness::comparable(Harness::phpResult(Spec::at($fixture, 'result'))), Harness::comparable(Harness::withoutUnknownFields($replayed->result, $fixture)));
    }

    #[DataProvider('errors')]
    public function test_an_error_fixture_s_answer_maps_to_its_exception_deferred_or_not(string $file): void
    {
        $fixture = Harness::load($file);
        $body = Spec::at($fixture, 'response', 'body', 'json');
        $headers = [];
        foreach ((array) Spec::at($fixture, 'response', 'headers') as $name => $value) {
            $headers[(string) $name] = Spec::text($value);
        }
        $error = ErrorFactory::make((int) Spec::text(Spec::at($fixture, 'response', 'status')), '', $headers, $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR));
        self::assertSame(Harness::comparable(Harness::phpResult(Spec::at($fixture, 'result'))), Harness::comparable(Harness::projectError($error)));
    }

    public function test_the_deferred_lists_name_only_real_fixtures_and_methods(): void
    {
        self::assertSame([], array_diff(Harness::DEFERRED_FIXTURES, Harness::fixtures()));
        self::assertSame([], array_diff(Harness::DEFERRED_METHODS, Harness::phpPaths()));
    }

    #[DataProvider('deferred')]
    public function test_a_deferred_fixture_can_t_replay_yet(string $file): void
    {
        try {
            Harness::replay(Harness::load($file));
            self::fail("{$file} replays now: take it off DEFERRED_FIXTURES.");
        } catch (\LogicException|NeuronAIException $error) {
            self::assertMatchesRegularExpression('/is not on the client|later version/', $error->getMessage());
        }
    }

    #[DataProvider('phpPaths')]
    public function test_every_method_exists_unless_it_is_deferred(string $path): void
    {
        $method = Harness::method(Harness::client(new MockClient()), $path);
        if (in_array($path, Harness::DEFERRED_METHODS, true)) {
            self::assertNull($method, "client->{$path} exists now: take it off DEFERRED_METHODS.");
        } else {
            self::assertNotNull($method, "client->{$path} is missing.");
        }
    }

    public function test_a_fixture_replays_for_every_operation_whose_method_exists(): void
    {
        $replayed = array_unique(array_map(static fn(string $file): string => explode('/', $file)[0], array_diff(Harness::fixtures(), Harness::DEFERRED_FIXTURES)));
        foreach ((array) Spec::at(Spec::read('operations.json'), 'operations') as $operationId => $entry) {
            if (!in_array(Spec::at($entry, 'php'), Harness::DEFERRED_METHODS, true)) {
                self::assertContains((string) $operationId, $replayed);
            }
        }
    }

    public function test_expect_request_passes_the_request_the_fixture_describes(): void
    {
        Harness::expectRequest([self::sent('/api/v1/tts/voices/O%27zbek?limit=3')], self::EXPECTED);
    }

    public function test_expect_request_fails_when_a_query_key_is_sent_twice(): void
    {
        $this->expectException(AssertionFailedError::class);
        Harness::expectRequest([self::sent('/api/v1/tts/voices/O%27zbek?limit=2&limit=3')], self::EXPECTED);
    }

    public function test_expect_request_fails_when_the_call_sends_more_than_one_request(): void
    {
        $request = self::sent('/api/v1/tts/voices/O%27zbek?limit=3');
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('The call sends exactly one request.');
        Harness::expectRequest([$request, $request], self::EXPECTED);
    }

    public function test_expect_request_compares_the_raw_target_so_a_path_encoded_otherwise_fails(): void
    {
        $this->expectException(AssertionFailedError::class);
        Harness::expectRequest([self::sent("/api/v1/tts/voices/O'zbek?limit=3")], self::EXPECTED);
    }

    public function test_unknown_fields_on_a_compatible_result_leave_the_body_and_never_the_cost(): void
    {
        $fixture = ['operationId' => 'createChatCompletion', 'unknown_fields' => ['/cost', '/beta']];
        $result = ['body' => ['id' => 'chatcmpl-x', 'cost' => 111, 'beta' => true], 'cost' => 999];
        self::assertSame(['body' => ['id' => 'chatcmpl-x'], 'cost' => 999], Harness::withoutUnknownFields($result, $fixture));
    }

    public function test_project_result_decides_the_shape_from_the_operation_not_from_the_value(): void
    {
        $page = (new \Naiuz\Resources\ApiKeys((new TestHttp(new MockClient(Replies::json(200, ['data' => [], 'next_cursor' => null, 'request_id' => 'r']))))->http))->list();
        foreach ([['retrieveApiKey', $page], ['listApiKeys', Voice::from(['id' => 'v', 'name' => 'V', 'language' => 'uz', 'tags' => [], 'type' => 'stock'])]] as [$operationId, $value]) {
            try {
                Harness::projectResult($operationId, $value);
                self::fail("{$operationId} should have refused that shape.");
            } catch (\LogicException $error) {
                self::assertStringStartsWith($operationId, $error->getMessage());
            }
        }
    }

    public function test_comparable_drops_nulls_and_tells_a_boolean_from_a_number(): void
    {
        self::assertSame(Harness::comparable(['b' => [1.0, []]]), Harness::comparable(['a' => null, 'b' => [1, ['c' => null]]]));
        self::assertNotSame(Harness::comparable(['enabled' => true]), Harness::comparable(['enabled' => 1]));
    }

    public function test_expect_request_passes_a_body_that_differs_only_in_key_order_or_how_a_number_is_written(): void
    {
        Harness::expectRequest([self::patched('{"enabled":true,"limit":1.0,"name":"Ops"}')], self::BODY_EXPECTED);
    }

    #[DataProvider('bodiesThatDiffer')]
    public function test_expect_request_compares_the_body_exactly_null_for_null(string $body): void
    {
        $this->expectException(AssertionFailedError::class);
        Harness::expectRequest([self::patched($body)], self::BODY_EXPECTED);
    }

    /** @return iterable<string, array{string}> */
    public static function bodiesThatDiffer(): iterable
    {
        yield 'a null the fixture doesn\'t hold' => ['{"name":"Ops","limit":1,"enabled":true,"expires_at":null}'];
        yield 'a field left out' => ['{"name":"Ops","limit":1}'];
        yield 'a number for a boolean' => ['{"name":"Ops","limit":1,"enabled":1}'];
    }

    private static function sent(string $target): RequestInterface
    {
        return new Request('GET', "https://my.neuronai.uz{$target}", ['authorization' => 'Bearer ' . Harness::FIXTURE_KEY]);
    }

    private static function patched(string $body): RequestInterface
    {
        return new Request('PATCH', 'https://my.neuronai.uz/api/v1/api-keys/key_1', ['authorization' => 'Bearer ' . Harness::FIXTURE_KEY], $body);
    }
}
