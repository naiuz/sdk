<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Exceptions\WaitTimeoutException;
use Naiuz\Resources\TtsJobs;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Types\TtsJob;
use Naiuz\Types\TtsJobStatus;
use Psr\Http\Message\RequestInterface;

final class TtsJobsTest extends TestCase
{
    private const UUID_V4 = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

    public function test_create_queues_the_text_with_an_idempotency_key_and_returns_the_job_the_202_holds(): void
    {
        $api = new MockClient(Replies::envelope(self::job('queued'), 'req-job', 202));
        $job = Clients::on($api)->tts->jobs->create(['text' => 'Salom', 'voice_id' => 'uz-sardor'], ['idempotency_key' => 'order-42']);
        self::assertSame(['job-1', 'queued', 'req-job'], [$job->id, $job->status, $job->request_id]);
        [$sent] = $api->requests;
        self::assertSame(['POST', '/api/v1/tts/jobs', 'order-42'], [$sent->getMethod(), $sent->getRequestTarget(), $sent->getHeaderLine('idempotency-key')]);
        self::assertSame('{"text":"Salom","voice_id":"uz-sardor"}', (string) $sent->getBody());
    }

    public function test_create_sends_a_generated_key_without_one_and_returns_the_job_a_200_replay_holds(): void
    {
        $replay = Replies::json(200, ['data' => self::job('succeeded'), 'request_id' => 'r'], ['idempotency-replayed' => '1']);
        $api = new MockClient($replay);
        $raw = Clients::on($api)->withRawResponse()->tts->jobs->create(['text' => 'Salom']);
        self::assertSame(['succeeded', 200, '1'], [$raw->data->status, $raw->status, $raw->headers['idempotency-replayed'] ?? null]);
        self::assertMatchesRegularExpression(self::UUID_V4, $api->requests[0]->getHeaderLine('idempotency-key'));
    }

    public function test_create_sends_every_field_it_is_given_a_null_as_null(): void
    {
        $api = new MockClient(Replies::envelope(self::job('queued'), status: 202));
        Clients::on($api)->tts->jobs->create(['text' => 'Salom', 'voice_id' => null, 'language' => 'uz', 'quality' => 'high', 'speed' => 1.25]);
        self::assertSame('{"text":"Salom","voice_id":null,"language":"uz","quality":"high","speed":1.25}', (string) $api->requests[0]->getBody());
    }

    public function test_create_refuses_a_key_it_doesn_t_take_sending_nothing(): void
    {
        $api = new MockClient();
        try {
            // PHPStan lets an array shape take keys it doesn't name, so only the SDK can catch this one.
            Clients::on($api)->tts->jobs->create(['text' => 'Salom', 'voice' => 'uz-sardor']);
            self::fail('The key should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame('tts->jobs->create() takes no parameter "voice": it takes text, voice_id, language, quality and speed.', $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    public function test_retrieve_reads_a_job_and_a_failed_job_s_error(): void
    {
        $failed = [...self::job('failed'), 'error' => ['code' => 'synthesis_failed', 'message' => 'The voice service failed.']];
        $api = new MockClient(Replies::envelope($failed, 'req-poll'));
        $job = Clients::on($api)->tts->jobs->retrieve('job-1');
        self::assertSame([TtsJobStatus::Failed, 'synthesis_failed', 'req-poll'], [TtsJobStatus::tryFrom($job->status), $job->error?->code, $job->request_id]);
        self::assertSame(['GET', '/api/v1/tts/jobs/job-1'], [$api->requests[0]->getMethod(), $api->requests[0]->getRequestTarget()]);
    }

    public function test_create_retries_a_reset_and_a_bare_502_with_the_same_key_and_retrieve_retries_a_reset(): void
    {
        $api = new MockClient(NetworkError::reset(), new Response(502, [], '<html>Bad Gateway</html>'), Replies::envelope(self::job('queued'), status: 202), NetworkError::reset(), Replies::envelope(self::job('running')));
        $jobs = new TtsJobs((new TestHttp($api, maxRetries: 2))->http);
        $jobs->create(['text' => 'Salom']);
        self::assertSame('running', $jobs->retrieve('job-1')->status);
        $keys = array_map(static fn(RequestInterface $request): string => $request->getHeaderLine('idempotency-key'), array_slice($api->requests, 0, 3));
        self::assertCount(1, array_unique($keys));
        self::assertCount(5, $api);
    }

    public function test_a_job_takes_a_status_the_sdk_doesn_t_know_yet(): void
    {
        $job = TtsJob::from(self::job('paused'));
        self::assertSame('paused', $job->status);
        self::assertNull(TtsJobStatus::tryFrom($job->status));
    }

    public function test_a_wait_timeout_exception_carries_the_job_as_last_seen(): void
    {
        $job = TtsJob::from(self::job('running'));
        $error = new WaitTimeoutException($job);
        self::assertSame($job, $error->job);
        self::assertSame('The job job-1 was still running when the wait ran out.', $error->getMessage());
        self::assertContains(NeuronAIException::class, class_parents($error));
    }

    /** @return array<string, mixed> */
    private static function job(string $status): array
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
            'error' => null,
            'audio_url' => null,
        ];
    }
}
