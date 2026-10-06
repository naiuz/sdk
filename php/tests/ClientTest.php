<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Exceptions\NeuronAIException;
use Naiuz\NeuronAI;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\Frames;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;

final class ClientTest extends TestCase
{
    private const BALANCE = ['balance' => 10000, 'formatted' => '10 000 credits', 'currency' => 'credits', 'stt_price_per_minute' => 500, 'tts_price_per_char' => 2.5, 'min_topup' => 5000];

    public function test_it_takes_the_key_from_api_key_else_from_neuronai_api_key(): void
    {
        self::setVariable('NEURONAI_API_KEY', 'nai_from_env');
        $api = new MockClient(Replies::envelope(self::BALANCE), Replies::envelope(self::BALANCE));
        (new NeuronAI(['http_client' => $api]))->account->balance();
        (new NeuronAI(['http_client' => $api, 'api_key' => TestHttp::KEY]))->account->balance();
        self::assertSame(['Bearer nai_from_env', 'Bearer ' . TestHttp::KEY], self::authorizations($api));
    }

    /** @param '_SERVER'|'_ENV'|'getenv' $source */
    #[DataProvider('environments')]
    public function test_it_reads_the_environment_from_server_env_or_getenv_whichever_holds_it(string $source): void
    {
        match ($source) {
            '_SERVER' => $_SERVER['NEURONAI_API_KEY'] = 'nai_from_server',
            '_ENV' => $_ENV['NEURONAI_API_KEY'] = 'nai_from_env',
            'getenv' => putenv('NEURONAI_API_KEY=nai_from_getenv'),
        };
        $api = new MockClient(Replies::envelope(self::BALANCE));
        (new NeuronAI(['http_client' => $api]))->account->balance();
        self::assertSame(['_SERVER' => 'Bearer nai_from_server', '_ENV' => 'Bearer nai_from_env', 'getenv' => 'Bearer nai_from_getenv'][$source], self::authorizations($api)[0]);
    }

    /** @return iterable<string, array{string}> */
    public static function environments(): iterable
    {
        yield '$_SERVER' => ['_SERVER'];
        yield '$_ENV' => ['_ENV'];
        yield 'getenv()' => ['getenv'];
    }

    public function test_it_fails_at_construction_not_on_the_first_call_when_there_is_no_key(): void
    {
        foreach ([[], ['api_key' => '  '], ['api_key' => null]] as $options) {
            try {
                new NeuronAI($options);
                self::fail('The client should have refused to start.');
            } catch (NeuronAIException $error) {
                self::assertSame('The API key is missing: pass api_key, or set NEURONAI_API_KEY.', $error->getMessage());
            }
        }
    }

    public function test_it_trims_the_whitespace_around_a_key(): void
    {
        self::setVariable('NEURONAI_API_KEY', '  ' . TestHttp::KEY . "\n");
        $api = new MockClient(Replies::envelope(self::BALANCE), Replies::envelope(self::BALANCE));
        (new NeuronAI(['http_client' => $api]))->account->balance();
        (new NeuronAI(['http_client' => $api, 'api_key' => "\t" . TestHttp::KEY . " \r\n"]))->account->balance();
        self::assertSame(['Bearer ' . TestHttp::KEY, 'Bearer ' . TestHttp::KEY], self::authorizations($api));
    }

    #[DataProvider('keysAHeaderCantCarry')]
    public function test_it_refuses_a_key_a_header_can_t_carry_without_quoting_it(string $key): void
    {
        try {
            new NeuronAI(['api_key' => $key]);
            self::fail('The key should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame("The API key contains a space, a line break or another character a header can't carry. Check how it was copied.", $error->getMessage());
            self::assertStringNotContainsString('abc', Frames::printed($error));
        }
    }

    /** @return iterable<string, array{string}> */
    public static function keysAHeaderCantCarry(): iterable
    {
        yield 'a space' => ['nai_abc def'];
        yield 'a line break' => ["nai_abc\ndef"];
        yield 'a NUL' => ["nai_abc\x00def"];
        yield 'a letter outside ASCII' => ['nai_abcключ'];
    }

    public function test_it_takes_the_base_url_from_base_url_else_the_environment_else_the_default(): void
    {
        self::assertSame('https://my.neuronai.uz/api/v1', (new NeuronAI(['api_key' => TestHttp::KEY]))->base_url);
        self::setVariable('NEURONAI_BASE_URL', ' https://my.neuronai.uz/from-env/api/v1/ ');
        self::assertSame('https://my.neuronai.uz/from-env/api/v1', (new NeuronAI(['api_key' => TestHttp::KEY]))->base_url);
        $client = new NeuronAI(['api_key' => TestHttp::KEY, 'base_url' => 'http://my.neuronai.uz/from-option/api/v1/']);
        self::assertSame('http://my.neuronai.uz/from-option/api/v1', $client->base_url);
    }

    #[DataProvider('notAnHttpUrl')]
    public function test_it_refuses_a_base_url_that_isn_t_an_http_or_https_url(string $baseUrl): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessageMatches('/^base_url must be an http or https URL, not "/');
        new NeuronAI(['api_key' => TestHttp::KEY, 'base_url' => $baseUrl]);
    }

    /** @return iterable<string, array{string}> */
    public static function notAnHttpUrl(): iterable
    {
        foreach (['my.neuronai.uz/api/v1', 'ftp://my.neuronai.uz', 'https://', 'https://[my.neuronai.uz', 'http://:80/api/v1'] as $baseUrl) {
            yield $baseUrl => [$baseUrl];
        }
    }

    public function test_it_defaults_to_a_300_second_timeout_and_2_retries(): void
    {
        $client = new NeuronAI(['api_key' => TestHttp::KEY]);
        self::assertSame([300.0, 2], [$client->timeout, $client->max_retries]);
    }

    #[DataProvider('invalidTimeouts')]
    public function test_it_refuses_an_invalid_timeout(mixed $timeout): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('timeout must be a number of seconds, more than 0 and at most 2147483.647.');
        // @phpstan-ignore argument.type (an untyped caller's mistake, which the client refuses)
        new NeuronAI(['api_key' => TestHttp::KEY, 'timeout' => $timeout]);
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidTimeouts(): iterable
    {
        foreach ([0, -1, NAN, INF, 2_147_484, true, '5'] as $timeout) {
            yield var_export($timeout, true) => [$timeout];
        }
    }

    #[DataProvider('invalidMaxRetries')]
    public function test_it_refuses_an_invalid_max_retries(mixed $maxRetries): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('max_retries must be a whole number, 0 or more.');
        // @phpstan-ignore argument.type (an untyped caller's mistake, which the client refuses)
        new NeuronAI(['api_key' => TestHttp::KEY, 'max_retries' => $maxRetries]);
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidMaxRetries(): iterable
    {
        foreach ([-1, 1.5, true] as $maxRetries) {
            yield var_export($maxRetries, true) => [$maxRetries];
        }
    }

    #[DataProvider('unknownOptions')]
    public function test_it_refuses_an_option_it_doesn_t_know_even_with_the_key_in_the_environment(string $name): void
    {
        self::setVariable('NEURONAI_API_KEY', TestHttp::KEY);
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage("Unknown option \"{$name}\": the client takes api_key, base_url, timeout, max_retries, default_headers and http_client.");
        // @phpstan-ignore argument.type (an untyped caller's mistake, which the client refuses)
        new NeuronAI([$name => 'nai_other_key']);
    }

    /** @return iterable<string, array{string}> */
    public static function unknownOptions(): iterable
    {
        yield 'apiKey' => ['apiKey'];
        yield 'maxRetries' => ['maxRetries'];
        yield 'baseURL' => ['baseURL'];
    }

    public function test_it_refuses_an_http_client_that_isn_t_a_psr_18_client(): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('http_client must be a PSR-18 client: an instance of Psr\Http\Client\ClientInterface.');
        // @phpstan-ignore argument.type (an untyped caller's mistake, which the client refuses)
        new NeuronAI(['api_key' => TestHttp::KEY, 'http_client' => new \stdClass()]);
    }

    public function test_it_refuses_default_headers_http_can_t_carry_at_construction(): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('The header "x-app" has a name or value that HTTP can\'t carry.');
        new NeuronAI(['api_key' => TestHttp::KEY, 'default_headers' => ['x-app' => "shop\r\n"]]);
    }

    public function test_it_sends_the_default_headers_with_every_call(): void
    {
        $api = new MockClient(Replies::envelope(self::BALANCE));
        (new NeuronAI(['api_key' => TestHttp::KEY, 'http_client' => $api, 'default_headers' => ['X-App' => 'shop']]))->account->balance();
        self::assertSame('shop', $api->requests[0]->getHeaderLine('x-app'));
    }

    public function test_it_sends_its_user_agent(): void
    {
        $api = new MockClient(Replies::envelope(self::BALANCE));
        Clients::on($api)->account->balance();
        self::assertSame(sprintf('naiuz-php/%s (PHP %d.%d)', NeuronAI::VERSION, PHP_MAJOR_VERSION, PHP_MINOR_VERSION), $api->requests[0]->getHeaderLine('user-agent'));
    }

    public function test_it_never_shows_the_key_when_dumped(): void
    {
        $client = new NeuronAI(['api_key' => TestHttp::KEY]);
        ob_start();
        var_dump($client, $client->account, $client->withRawResponse());
        $dumped = (string) ob_get_clean();
        foreach ([$dumped, print_r($client, true), var_export($client, true), (string) json_encode($client)] as $printed) {
            self::assertStringNotContainsString(TestHttp::KEY, $printed);
        }
    }

    public function test_it_can_t_be_serialized_so_its_key_never_lands_in_a_cache_or_a_session(): void
    {
        $this->expectException(\Exception::class);
        $this->expectExceptionMessageMatches("/^Serialization of '\\w+' is not allowed$/");
        serialize(new NeuronAI(['api_key' => TestHttp::KEY]));
    }

    /** @param array<string, mixed> $options */
    #[DataProvider('refusedOptions')]
    public function test_no_frame_of_the_sdk_holds_the_key_when_an_option_is_refused(array $options): void
    {
        foreach ([[], ['api_key' => TestHttp::KEY]] as $key) {
            self::setVariable('NEURONAI_API_KEY', TestHttp::KEY);
            try {
                // @phpstan-ignore argument.type (an untyped caller's mistakes, which the client refuses)
                new NeuronAI([...$options, ...$key]);
                self::fail('The option should have been refused.');
            } catch (NeuronAIException $error) {
                self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
            }
        }
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function refusedOptions(): iterable
    {
        yield 'timeout' => [['timeout' => -1]];
        yield 'max_retries' => [['max_retries' => -1]];
        yield 'base_url' => [['base_url' => 'ftp://example']];
        yield 'default_headers' => [['default_headers' => ['x-app' => "a\nb"]]];
        yield 'http_client' => [['http_client' => 'guzzle']];
    }

    public function test_no_frame_of_the_sdk_holds_a_key_it_refuses(): void
    {
        foreach ([static fn(): NeuronAI => new NeuronAI(['api_key' => TestHttp::KEY . ' copied']), static function (): NeuronAI {
            self::setVariable('NEURONAI_API_KEY', TestHttp::KEY . ' copied');

            return new NeuronAI();
        }] as $build) {
            try {
                $build();
                self::fail('The key should have been refused.');
            } catch (NeuronAIException $error) {
                self::assertStringContainsString('contains a space', $error->getMessage());
                self::assertNotSame([], Frames::sdk($error));
                self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
            }
        }
    }

    /** @return list<string> */
    private static function authorizations(MockClient $api): array
    {
        return array_map(static fn(RequestInterface $request): string => $request->getHeaderLine('authorization'), $api->requests);
    }
}
