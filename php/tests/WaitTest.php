<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Psr7\Response;
use Naiuz\Core\Answer;
use Naiuz\Core\Transport\GuzzleTransport;
use Naiuz\Core\Transport\SymfonyTransport;
use Naiuz\Core\Transport\Transport;
use Naiuz\Exceptions\AuthenticationException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Exceptions\NotFoundException;
use Naiuz\Exceptions\WaitTimeoutException;
use Naiuz\Resources\TtsJobs;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\FakeTransport;
use Naiuz\Tests\Support\Frames;
use Naiuz\Tests\Support\LocalServer;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Symfony\Component\HttpClient\HttpClient as SymfonyHttpClient;

final class WaitTest extends TestCase
{
    private ?LocalServer $server = null;

    protected function tearDown(): void
    {
        $this->server?->stop();
        parent::tearDown();
    }

    public function test_it_creates_the_job_then_polls_it_every_interval_until_it_succeeds(): void
    {
        $api = new MockClient(self::job('queued', 202), self::job('running'), self::job('succeeded', requestId: 'req-last'));
        $test = new TestHttp($api);
        $job = (new TtsJobs($test->http))->createAndWait(['text' => 'Salom', 'voice_id' => 'uz-sardor']);
        self::assertSame(['job-1', 'succeeded', 'req-last'], [$job->id, $job->status, $job->request_id]);
        self::assertSame([2.0, 2.0], $test->waits);
        self::assertSame(
            ['POST /api/v1/tts/jobs', 'GET /api/v1/tts/jobs/job-1', 'GET /api/v1/tts/jobs/job-1'],
            array_map(static fn(RequestInterface $request): string => "{$request->getMethod()} {$request->getRequestTarget()}", $api->requests),
        );
        self::assertSame('{"text":"Salom","voice_id":"uz-sardor"}', (string) $api->requests[0]->getBody());
    }

    public function test_it_returns_a_failed_job_as_it_is(): void
    {
        $job = (new TtsJobs((new TestHttp(new MockClient(self::job('queued', 202), self::job('failed'))))->http))->createAndWait(['text' => 'Salom'], ['poll_interval' => 0.5]);
        self::assertSame(['failed', 'synthesis_failed'], [$job->status, $job->error?->code]);
    }

    public function test_a_create_that_replays_a_finished_job_returns_it_at_once_without_a_wait_or_a_poll(): void
    {
        // Calling again with the same idempotency_key after a WaitTimeoutException, as the README advises, replays the job.
        $api = new MockClient(self::job('succeeded'));
        $test = new TestHttp($api);
        $job = (new TtsJobs($test->http))->createAndWait(['text' => 'Salom'], ['idempotency_key' => 'chapter-7']);
        self::assertSame('succeeded', $job->status);
        self::assertSame([[], 1, 'chapter-7'], [$test->waits, count($api->requests), $api->requests[0]->getHeaderLine('idempotency-key')]);
    }

    public function test_it_throws_wait_timeout_exception_with_the_job_as_last_seen_at_the_deadline(): void
    {
        $api = new MockClient(self::job('queued', 202), self::job('running'), self::job('running', requestId: 'req-last'));
        $test = new TestHttp($api);
        try {
            (new TtsJobs($test->http))->createAndWait(['text' => 'Salom'], ['poll_interval' => 2, 'timeout' => 5]);
            self::fail('The wait should have run out.');
        } catch (WaitTimeoutException $error) {
            self::assertSame(['running', 'req-last', 'The job job-1 was still running when the wait ran out.'], [$error->job->status, $error->job->request_id, $error->getMessage()]);
        }
        self::assertSame([2.0, 2.0, 1.0], $test->waits);
        self::assertCount(3, $api->requests);
    }

    public function test_a_poll_that_fails_as_a_read_would_retry_doesn_t_end_the_wait_and_a_429_sets_the_pause(): void
    {
        $api = new MockClient(
            self::job('queued', 202),
            NetworkError::reset(),
            Replies::apiError(503, 'service_unavailable'),
            Replies::apiError(429, 'rate_limit_exceeded', ['retry-after' => '7']),
            new Response(502, [], '<html>Bad Gateway</html>'),
            self::job('succeeded'),
        );
        $test = new TestHttp($api, maxRetries: 2);
        self::assertSame('succeeded', (new TtsJobs($test->http))->createAndWait(['text' => 'Salom'])->status);
        // Each poll is one attempt: the core retries none of them, and the wait sleeps its interval, or the 429's longer wait.
        self::assertSame([2.0, 2.0, 2.0, 7.0, 2.0], $test->waits);
        self::assertCount(6, $api->requests);
    }

    /** @param \Closure(): (ResponseInterface|\Throwable) $failure */
    #[DataProvider('failuresThatEndTheWait')]
    public function test_any_other_failure_ends_the_wait_at_once(\Closure $failure, string $class): void
    {
        $api = new MockClient(self::job('queued', 202), $failure(), self::job('succeeded'));
        $test = new TestHttp($api);
        try {
            (new TtsJobs($test->http))->createAndWait(['text' => 'Salom']);
            self::fail('The wait should have ended.');
        } catch (NeuronAIException $error) {
            self::assertSame($class, $error::class);
        }
        self::assertSame([[2.0], 2], [$test->waits, count($api->requests)]);
    }

    /** @return iterable<string, array{\Closure(): (ResponseInterface|\Throwable), class-string}> */
    public static function failuresThatEndTheWait(): iterable
    {
        yield 'a 401' => [static fn(): ResponseInterface => Replies::apiError(401, 'api_key_revoked'), AuthenticationException::class];
        yield 'a 404' => [static fn(): ResponseInterface => Replies::apiError(404, 'not_found'), NotFoundException::class];
    }

    public function test_each_poll_is_one_attempt_whose_timeout_is_the_client_s_cut_to_the_time_left(): void
    {
        [$queued, $running, $succeeded] = array_map(static fn(string $status): Answer => FakeTransport::ok((string) self::job($status)->getBody()), ['queued', 'running', 'succeeded']);
        $long = new FakeTransport($queued, $running, $running);
        try {
            (new TtsJobs((new TestHttp($long, timeout: 300.0))->http))->createAndWait(['text' => 'Salom'], ['poll_interval' => 4, 'timeout' => 10]);
            self::fail('The wait should have run out.');
        } catch (WaitTimeoutException) {
            // The polls at 4 and 8 seconds found the job running, and the wait ran out at 10.
        }
        // The create keeps the client's timeout; each poll gets what is left of the wait.
        self::assertSame([300.0, 6.0, 2.0], $long->timeouts);
        $short = new FakeTransport($queued, $running, $succeeded);
        (new TtsJobs((new TestHttp($short, timeout: 1.5))->http))->createAndWait(['text' => 'Salom'], ['poll_interval' => 4, 'timeout' => 10]);
        self::assertSame([1.5, 1.5, 1.5], $short->timeouts);
    }

    public function test_the_create_takes_the_wait_s_key_and_retries_and_every_request_its_extra_headers(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable'), self::job('queued', 202), self::job('succeeded'));
        (new TtsJobs((new TestHttp($api, maxRetries: 0))->http))->createAndWait(['text' => 'Salom'], ['idempotency_key' => 'chapter-7', 'max_retries' => 1, 'extra_headers' => ['x-trace' => 'wait-1']]);
        self::assertSame(
            [['chapter-7', 'wait-1'], ['chapter-7', 'wait-1'], ['', 'wait-1']],
            array_map(static fn(RequestInterface $request): array => [$request->getHeaderLine('idempotency-key'), $request->getHeaderLine('x-trace')], $api->requests),
        );
    }

    /** @param array<mixed> $options */
    #[DataProvider('optionsTheWaitDoesntTake')]
    public function test_it_refuses_an_option_it_doesn_t_take_sending_nothing(array $options, string $message): void
    {
        $api = new MockClient();
        try {
            // @phpstan-ignore argument.type (an untyped caller's mistakes, which the wait refuses)
            (new TtsJobs((new TestHttp($api))->http))->createAndWait(['text' => 'Salom'], $options);
            self::fail('The option should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame($message, $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    /** @return iterable<string, array{array<mixed>, string}> */
    public static function optionsTheWaitDoesntTake(): iterable
    {
        yield 'a camelCase name' => [['pollInterval' => 1], 'Unknown option "pollInterval": createAndWait() takes poll_interval, timeout, idempotency_key, max_retries and extra_headers.'];
        yield 'an interval of 0' => [['poll_interval' => 0], 'poll_interval must be a number of seconds, more than 0 and at most 2147483.647.'];
        yield 'a timeout as text' => [['timeout' => '600'], 'timeout must be a number of seconds, more than 0 and at most 2147483.647.'];
        yield 'retries as a bool' => [['max_retries' => true], 'max_retries must be a whole number, 0 or more.'];
    }

    /** @return iterable<string, array{\Closure(): Transport}> */
    public static function transports(): iterable
    {
        yield 'guzzle' => [static fn(): Transport => new GuzzleTransport(new GuzzleClient())];
        yield 'symfony' => [static fn(): Transport => new SymfonyTransport(SymfonyHttpClient::create())];
    }

    /** @param \Closure(): Transport $transport */
    #[DataProvider('transports')]
    public function test_the_wait_ends_near_its_deadline_when_a_poll_hangs_on_a_silent_server(\Closure $transport): void
    {
        $queued = json_encode(['data' => self::fields('queued'), 'request_id' => 'req-1'], JSON_THROW_ON_ERROR);
        // The create is answered; every poll after it gets nothing back.
        $server = $this->server = LocalServer::answering("HTTP/1.1 202 Accepted\r\nContent-Type: application/json\r\nContent-Length: " . strlen($queued) . "\r\nConnection: close\r\n\r\n{$queued}", '');
        $jobs = new TtsJobs(Clients::http($transport(), $server->baseUrl));
        $started = microtime(true);
        try {
            $jobs->createAndWait(['text' => 'Salom'], ['poll_interval' => 0.05, 'timeout' => 0.5]);
            self::fail('The wait should have run out.');
        } catch (WaitTimeoutException $error) {
            self::assertSame(['job-1', 'queued'], [$error->job->id, $error->job->status]);
        }
        // Not the client's 300 seconds: the poll in flight at the deadline ends about then.
        self::assertLessThan(1.5, microtime(true) - $started);
    }

    public function test_no_frame_of_the_sdk_holds_the_key_when_a_wait_ends(): void
    {
        $echo = new Response(401, ['content-type' => 'text/html'], '<pre>Authorization: Bearer ' . TestHttp::KEY . '</pre>');
        foreach ([[self::job('queued', 202), $echo], [self::job('queued', 202), self::job('running')]] as $replies) {
            try {
                (new TtsJobs((new TestHttp(new MockClient(...$replies)))->http))->createAndWait(['text' => 'Salom'], ['poll_interval' => 1, 'timeout' => 1]);
                self::fail('The wait should have ended.');
            } catch (NeuronAIException $error) {
                self::assertNotSame([], Frames::sdk($error));
                self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
            }
        }
    }

    private static function job(string $status, int $code = 200, string $requestId = 'req-job'): ResponseInterface
    {
        return Replies::envelope(self::fields($status), $requestId, $code);
    }

    /** @return array<string, mixed> */
    private static function fields(string $status): array
    {
        return [
            'id' => 'job-1',
            'status' => $status,
            'created_at' => '2026-09-28T10:00:00Z',
            'started_at' => null,
            'finished_at' => null,
            'character_count' => 5,
            'cost' => null,
            'balance_after' => null,
            'voice_custom' => false,
            'latency_ms' => null,
            'error' => $status === 'failed' ? ['code' => 'synthesis_failed', 'message' => 'The voice service failed.'] : null,
            'audio_url' => null,
        ];
    }
}
