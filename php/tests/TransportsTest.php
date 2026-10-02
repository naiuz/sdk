<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Composer\InstalledVersions;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\HttpFactory;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Http\Discovery\ClassDiscovery;
use Naiuz\Core\Clock;
use Naiuz\Core\Transport\Body;
use Naiuz\Core\Transport\GuzzleTransport;
use Naiuz\Core\Transport\Psr18Transport;
use Naiuz\Core\Transport\SymfonyTransport;
use Naiuz\Core\Transport\Transport;
use Naiuz\Core\Transport\TransportFailure;
use Naiuz\Core\Transport\Transports;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Tests\Support\DripStream;
use Naiuz\Tests\Support\Guzzle7ConnectException;
use Naiuz\Tests\Support\LocalServer;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;
use Symfony\Component\HttpClient\HttpClient as SymfonyHttpClient;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Psr18Client as SymfonyClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class TransportsTest extends TestCase
{
    private const HEADERS = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n";

    private const STREAM = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 6\r\n\r\n";

    private ?LocalServer $server = null;

    protected function tearDown(): void
    {
        $this->server?->stop();
        parent::tearDown();
    }

    public function test_it_reads_an_answer_whole_its_headers_by_lower_case_name(): void
    {
        $reply = new Response(201, ['X-Request-Id' => 'r1', 'X-Many' => ['a', 'b']], '{"ok":true}', '1.1', 'Created');
        $answer = (new Psr18Transport(new MockClient($reply)))->fetch(self::request(), 1.0);
        self::assertSame([201, 'Created', '{"ok":true}'], [$answer->status, $answer->reason, $answer->body]);
        self::assertSame(['x-request-id' => 'r1', 'x-many' => 'a, b'], $answer->headers);
    }

    public function test_it_stops_reading_a_body_that_drips_past_the_timeout_and_closes_it(): void
    {
        $body = new DripStream(['{'], gap: 0.02, forever: true);
        $started = microtime(true);
        $failure = self::failure(new Psr18Transport(new MockClient(Replies::dripping($body))), 0.2);
        self::assertTrue($failure->timedOut);
        self::assertTrue($failure->reading);
        self::assertLessThan(1.0, microtime(true) - $started);
        self::assertTrue($body->closed);
    }

    public function test_it_reports_a_body_that_fails_part_way_with_the_deepest_message(): void
    {
        $error = new \RuntimeException('Unable to read from stream', 0, new \RuntimeException('Connection reset by peer'));
        $body = new DripStream(['{"data": {'], error: $error);
        $failure = self::failure(new Psr18Transport(new MockClient(Replies::dripping($body))), 1.0);
        self::assertSame(['Connection reset by peer', false, false, true], [$failure->getMessage(), $failure->timedOut, $failure->beforeSend, $failure->reading]);
        self::assertTrue($body->closed);
    }

    public function test_it_takes_a_client_s_failure_as_possibly_sent_with_its_deepest_message(): void
    {
        $failure = self::failure(new Psr18Transport(new MockClient(new NetworkError('', NetworkError::reset()))), 1.0);
        self::assertSame(['Connection reset by peer', false, false, false], [$failure->getMessage(), $failure->timedOut, $failure->beforeSend, $failure->reading]);
    }

    public function test_an_answer_that_comes_after_the_deadline_counts_as_a_timeout(): void
    {
        $late = static function (RequestInterface $request): Response {
            usleep(300_000);

            return new Response(200, [], '{}');
        };
        self::assertTrue(self::failure(new Psr18Transport(new MockClient($late)), 0.2)->timedOut);
    }

    public function test_a_failure_a_hair_before_the_deadline_counts_as_the_timeout_it_is(): void
    {
        // curl rounds the time it has waited up to whole milliseconds, so it may give up just before the SDK's deadline.
        $early = static function (RequestInterface $request): never {
            usleep(197_000);

            throw new NetworkError('Operation timed out after 200 milliseconds with 0 bytes received');
        };
        self::assertTrue(self::failure(new Psr18Transport(new MockClient($early)), 0.2)->timedOut);
        try {
            Body::piece(new DripStream([], gap: 0.197, error: new \RuntimeException('Unable to read from stream')), 8192, Clock::monotonic() + 0.2);
            self::fail('The read should have failed.');
        } catch (TransportFailure $failure) {
            self::assertTrue($failure->timedOut);
        }
        // Long before the deadline, a failure is only a failure.
        self::assertFalse(self::failure(new Psr18Transport(new MockClient(NetworkError::reset())), 0.2)->timedOut);
    }

    public function test_symfony_counts_each_attempt_that_runs_out_as_a_timeout_on_a_client_it_keeps(): void
    {
        // A client kept for many calls sets each one up fast, so curl's rounding shows: alone, it would end some early.
        $server = $this->server = LocalServer::start('');
        $transport = new SymfonyTransport(SymfonyHttpClient::create());
        foreach (range(1, 8) as $attempt) {
            self::assertTrue(self::failure($transport, 0.1, $server->baseUrl)->timedOut, "attempt {$attempt}");
        }
    }

    public function test_open_hands_the_answer_over_with_its_body_unread(): void
    {
        $body = new DripStream(['a', 'b']);
        $response = (new Psr18Transport(new MockClient(Replies::dripping($body))))->open(self::request(), 1.0);
        self::assertSame(200, $response->getStatusCode());
        self::assertFalse($body->finished);
        self::assertFalse($body->closed);
    }

    public function test_guzzle_gets_each_attempt_s_timeout_no_redirects_and_error_statuses_as_answers(): void
    {
        $mock = new MockHandler([new Response(404), new Response(302, ['location' => 'https://my.neuronai.uz/elsewhere'])]);
        $transport = new GuzzleTransport(new GuzzleClient(['handler' => HandlerStack::create($mock), 'timeout' => 1000]));
        self::assertSame(404, $transport->fetch(self::request(), 0.2503)->status);
        $first = $mock->getLastOptions();
        self::assertSame(302, $transport->fetch(self::request(), 2.0)->status);
        $second = $mock->getLastOptions();
        self::assertSame([0.251, false, false], [$first['timeout'] ?? null, $first['allow_redirects'] ?? null, $first['http_errors'] ?? null]);
        self::assertSame(2.0, $second['timeout'] ?? null);
    }

    public function test_guzzle_streams_an_answer_it_opens_its_timeout_bounding_each_read(): void
    {
        $mock = new MockHandler([new Response(200)]);
        (new GuzzleTransport(new GuzzleClient(['handler' => $mock])))->open(self::request(), 0.3);
        $options = $mock->getLastOptions();
        // Guzzle 7's stream handler scales read_timeout's fraction ten times too short, so there timeout alone bounds each read.
        $readTimeout = \constant('GuzzleHttp\\ClientInterface::MAJOR_VERSION') === 7 ? null : 0.3;
        self::assertSame([true, 0.3, $readTimeout], [$options['stream'] ?? null, $options['timeout'] ?? null, $options['read_timeout'] ?? null]);
    }

    public function test_guzzle_refuses_to_open_a_stream_while_allow_url_fopen_is_off_sending_nothing(): void
    {
        $mock = new MockHandler([new Response(200), new Response(200)]);
        $off = new GuzzleTransport(new GuzzleClient(['handler' => $mock]), static fn(): bool => false);
        try {
            $off->open(self::request(), 1.0);
            self::fail('The stream should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertStringStartsWith("A stream through Guzzle needs PHP's allow_url_fopen setting, which is off", $error->getMessage());
        }
        self::assertCount(2, $mock);
        // Any other call goes through as usual, and the setting PHP has, on here, lets a stream open.
        self::assertSame(200, $off->fetch(self::request(), 1.0)->status);
        self::assertSame(200, (new GuzzleTransport(new GuzzleClient(['handler' => $mock])))->open(self::request(), 1.0)->getStatusCode());
    }

    /** @param list<string> $then */
    #[DataProvider('silentServers')]
    public function test_guzzle_ends_an_attempt_at_its_timeout_wherever_the_server_goes_silent(string $first, float $gap, array $then): void
    {
        $this->server = LocalServer::start($first, $gap, ...$then);
        $started = microtime(true);
        $failure = self::failure(new GuzzleTransport(new GuzzleClient()), 0.3, $this->server->baseUrl);
        self::assertTrue($failure->timedOut);
        self::assertFalse($failure->beforeSend);
        self::assertLessThan(2.0, microtime(true) - $started);
    }

    /** @param list<string> $then */
    #[DataProvider('silentServers')]
    public function test_symfony_ends_an_attempt_at_its_timeout_wherever_the_server_goes_silent(string $first, float $gap, array $then): void
    {
        $this->server = LocalServer::start($first, $gap, ...$then);
        $started = microtime(true);
        $failure = self::failure(new SymfonyTransport(SymfonyHttpClient::create()), 0.3, $this->server->baseUrl);
        self::assertTrue($failure->timedOut);
        self::assertLessThan(2.0, microtime(true) - $started);
    }

    /** @return iterable<string, array{string, float, list<string>}> */
    public static function silentServers(): iterable
    {
        yield 'never answers' => ['', 0.0, []];
        yield 'goes silent mid-answer' => [self::HEADERS . '{', 0.0, []];
        yield 'drips' => [self::HEADERS . '{', 0.05, array_fill(0, 60, ' ')];
    }

    public function test_guzzle_says_a_refused_connection_was_never_sent(): void
    {
        $failure = self::failure(new GuzzleTransport(new GuzzleClient()), 1.0, LocalServer::refusing());
        self::assertSame([true, false], [$failure->beforeSend, $failure->timedOut]);
        self::assertStringContainsString('Failed to connect', $failure->getMessage());
    }

    public function test_symfony_can_t_tell_a_refused_connection_was_never_sent(): void
    {
        $failure = self::failure(new SymfonyTransport(SymfonyHttpClient::create()), 1.0, LocalServer::refusing());
        self::assertSame([false, false], [$failure->beforeSend, $failure->timedOut]);
    }

    public function test_guzzle_7_counts_a_connect_failure_as_never_sent_only_when_curl_wrote_none_of_the_request(): void
    {
        $refused = new Guzzle7ConnectException('cURL error 7: Failed to connect', ['errno' => 7, 'request_size' => 0]);
        $silent = new Guzzle7ConnectException('cURL error 28: Operation timed out', ['errno' => 28, 'request_size' => 112]);
        $nothing = new Guzzle7ConnectException('cURL error 52: Empty reply from server', ['errno' => 52, 'request_size' => 112]);
        $connectTimeout = new Guzzle7ConnectException('cURL error 28: Connection timed out', ['errno' => 28, 'request_size' => 0]);
        $transport = new GuzzleTransport(new GuzzleClient(['handler' => new MockHandler([$refused, $silent, $nothing, $connectTimeout])]));
        $outcomes = [];
        foreach (range(1, 4) as $attempt) {
            $failure = self::failure($transport, 10.0);
            $outcomes[] = [$failure->beforeSend, $failure->timedOut];
        }
        self::assertSame([[true, false], [false, true], [false, false], [true, true]], $outcomes);
    }

    public function test_symfony_gets_each_attempt_s_timeout_a_bound_on_the_whole_answer_and_no_redirects(): void
    {
        $seen = [];
        $mock = new MockHttpClient(static function (string $method, string $url, array $options) use (&$seen): MockResponse {
            $seen[] = [$options['timeout'] ?? null, $options['max_duration'] ?? null, $options['max_redirects'] ?? null];

            return new MockResponse('{}', ['http_code' => 200]);
        });
        $transport = new SymfonyTransport($mock);
        $transport->fetch(self::request(), 0.25);
        $transport->open(self::request(), 0.3);
        // As Guzzle's sendRequest() has it: a redirect comes back as the answer, which the core throws as APIException.
        self::assertSame([[0.25, 0.25, 0], [0.3, 0.0, 0]], $seen);
    }

    public function test_a_symfony_psr_18_client_given_gets_each_attempt_s_options_from_6_2_on_and_keeps_its_own_before(): void
    {
        $seen = [];
        $mock = new MockHttpClient(static function (string $method, string $url, array $options) use (&$seen): MockResponse {
            $seen[] = [$options['max_duration'] ?? null, $options['max_redirects'] ?? null];

            return new MockResponse('{}', ['http_code' => 200]);
        });
        $transport = Transports::for(new SymfonyClient($mock));
        self::assertSame(200, $transport->fetch(self::request(), 0.25)->status);
        if (self::symfonyTakesOptions()) {
            self::assertSame([SymfonyTransport::class, [[0.25, 0]]], [$transport::class, $seen]);
        } else {
            // Before 6.2 Symfony's PSR-18 client has no withOptions(): its calls go as any PSR-18 client's, on its own options.
            self::assertSame([Psr18Transport::class, 1], [$transport::class, count($seen)]);
        }
    }

    public function test_guzzle_reads_a_stream_that_outlasts_the_timeout_while_pieces_keep_coming(): void
    {
        $this->server = LocalServer::start(self::STREAM, 0.1, 'a', 'b', 'c', 'd', 'e', 'f');
        self::assertSame('abcdef', self::readStream(new GuzzleTransport(new GuzzleClient()), $this->server->baseUrl, 0.3, 6));
    }

    public function test_symfony_reads_a_stream_that_outlasts_the_timeout_while_pieces_keep_coming(): void
    {
        $this->server = LocalServer::start(self::STREAM, 0.1, 'a', 'b', 'c', 'd', 'e', 'f');
        self::assertSame('abcdef', self::readStream(new SymfonyTransport(SymfonyHttpClient::create()), $this->server->baseUrl, 0.3, 6));
    }

    /** @return iterable<string, array{\Closure(): Transport}> */
    public static function streamingTransports(): iterable
    {
        yield 'guzzle' => [static fn(): Transport => new GuzzleTransport(new GuzzleClient())];
        yield 'symfony' => [static fn(): Transport => new SymfonyTransport(SymfonyHttpClient::create())];
    }

    /** @param \Closure(): Transport $transport */
    #[DataProvider('streamingTransports')]
    public function test_a_stream_s_read_ends_after_a_silence_longer_than_the_timeout(\Closure $transport): void
    {
        $server = $this->server = LocalServer::start(self::STREAM . 'a', 1.0, 'b');
        $started = microtime(true);
        try {
            self::readStream($transport(), $server->baseUrl, 0.3, 6);
            self::fail('The read should have ended.');
        } catch (TransportFailure $failure) {
            self::assertSame([true, true], [$failure->timedOut, $failure->reading]);
            self::assertLessThan(0.9, microtime(true) - $started);
        }
    }

    public function test_it_picks_the_transport_for_the_client_given(): void
    {
        self::assertSame(GuzzleTransport::class, Transports::for(new GuzzleClient())::class);
        self::assertSame(self::symfonyTakesOptions() ? SymfonyTransport::class : Psr18Transport::class, Transports::for(new SymfonyClient())::class);
        self::assertSame(Psr18Transport::class, Transports::for(new MockClient())::class);
    }

    public function test_it_makes_guzzle_when_it_is_installed_else_symfony_else_what_discovery_finds(): void
    {
        self::assertSame(GuzzleTransport::class, Transports::for(null)::class);
        $withoutGuzzle = static fn(string $class): bool => $class !== GuzzleClient::class;
        self::assertSame(SymfonyTransport::class, Transports::for(null, $withoutGuzzle)::class);
        self::assertContains(Transports::for(null, static fn(string $class): bool => false)::class, [GuzzleTransport::class, SymfonyTransport::class, Psr18Transport::class]);
    }

    public function test_it_says_what_to_install_when_no_client_or_factory_is_found(): void
    {
        $strategies = [...ClassDiscovery::getStrategies()];
        ClassDiscovery::setStrategies([]);
        try {
            foreach ([static fn(): mixed => Transports::for(null, static fn(string $class): bool => false), static fn(): mixed => Transports::factories()] as $find) {
                try {
                    $find();
                    self::fail('Nothing should have been found.');
                } catch (NeuronAIException $error) {
                    self::assertStringContainsString('composer require guzzlehttp/guzzle', $error->getMessage());
                }
            }
        } finally {
            ClassDiscovery::setStrategies($strategies);
        }
        [$requests, $streams] = Transports::factories();
        self::assertSame(['GET', '{}'], [$requests->createRequest('GET', 'https://my.neuronai.uz')->getMethod(), (string) $streams->createStream('{}')]);
    }

    /** Whether the Symfony HttpClient installed is 6.2 or later, whose PSR-18 client takes options per request. */
    private static function symfonyTakesOptions(): bool
    {
        return version_compare((string) InstalledVersions::getVersion('symfony/http-client'), '6.2', '>=');
    }

    private static function request(string $baseUrl = 'https://my.neuronai.uz/api/v1'): RequestInterface
    {
        return new Request('GET', "{$baseUrl}/balance", ['authorization' => 'Bearer nai_unit_test_key']);
    }

    private static function failure(Transport $transport, float $timeout, string $baseUrl = 'https://my.neuronai.uz/api/v1'): TransportFailure
    {
        try {
            $transport->fetch(self::request($baseUrl), $timeout);
        } catch (TransportFailure $failure) {
            return $failure;
        }
        self::fail('The attempt should have failed.');
    }

    /** Opens a stream and reads $length bytes of it piece by piece, each piece within $timeout. */
    private static function readStream(Transport $transport, string $baseUrl, float $timeout, int $length): string
    {
        $body = $transport->open((new HttpFactory())->createRequest('GET', "{$baseUrl}/stream"), $timeout)->getBody();
        $content = '';
        while (strlen($content) < $length) {
            // A stream that ends short fails here, rather than spinning on empty reads until CI's limit.
            if ($body->eof()) {
                self::fail(sprintf('The stream ended after %d of %d bytes.', strlen($content), $length));
            }
            $content .= Body::piece($body, $length - strlen($content), Clock::monotonic() + $timeout);
        }
        $body->close();

        return $content;
    }
}
