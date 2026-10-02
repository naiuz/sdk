<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\GoneException;
use Naiuz\NeuronAI;
use Naiuz\Resources\Tts;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\Frames;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;

final class TtsTest extends TestCase
{
    private const WAV = "RIFF\x24\x00\x00\x00WAVEfmt ";

    private const UUID_V4 = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

    private const TURNS = '[{"index":0,"voice_id":"uz-sardor","start_s":0,"end_s":0.8,"duration_s":0.8},{"index":1,"voice_id":"uz-malika","start_s":1.1,"end_s":2.4,"duration_s":1.3}]';

    public function test_synthesize_sends_the_text_with_an_idempotency_key_and_takes_back_the_wav(): void
    {
        $api = new MockClient(Replies::audio(self::WAV, ['idempotency-replayed' => '1']));
        $speech = Clients::on($api)->tts->synthesize(['text' => 'Salom', 'voice_id' => 'uz-sardor', 'quality' => 'high'], ['idempotency_key' => 'line-1']);
        self::assertSame([self::WAV, 'audio/wav', 12.5, 5, true, 'req-audio'], [$speech->audio, $speech->content_type, $speech->cost, $speech->character_count, $speech->replayed, $speech->request_id]);
        [$sent] = $api->requests;
        self::assertSame(['POST', '/api/v1/tts/synthesize', 'line-1', 'audio/wav, application/json'], [$sent->getMethod(), $sent->getRequestTarget(), $sent->getHeaderLine('idempotency-key'), $sent->getHeaderLine('accept')]);
        self::assertSame('{"text":"Salom","voice_id":"uz-sardor","quality":"high"}', (string) $sent->getBody());
    }

    public function test_synthesize_retries_a_bare_502_and_a_reset_with_the_same_generated_key(): void
    {
        $api = new MockClient(new Response(502, [], '<html>Bad Gateway</html>'), NetworkError::reset(), Replies::audio());
        (new Tts((new TestHttp($api))->http))->synthesize(['text' => 'Salom']);
        $keys = array_map(static fn(RequestInterface $request): string => $request->getHeaderLine('idempotency-key'), $api->requests);
        self::assertCount(3, $keys);
        self::assertCount(1, array_unique($keys));
        self::assertMatchesRegularExpression(self::UUID_V4, $keys[0]);
    }

    public function test_dialogue_sends_its_turns_and_takes_back_where_each_sits(): void
    {
        $api = new MockClient(Replies::audio(self::WAV, ['x-turns' => self::TURNS, 'x-turn-count' => '2']));
        $turns = [['voice_id' => 'uz-sardor', 'text' => 'Salom!'], ['voice_id' => 'uz-malika', 'text' => 'Assalomu alaykum!', 'speed' => 1.1]];
        $dialogue = Clients::on($api)->tts->dialogue(['turns' => $turns, 'gap_ms' => 300], ['idempotency_key' => 'scene-1']);
        self::assertSame([2, 'uz-malika', 1.1], [$dialogue->turn_count, $dialogue->turns[1]->voice_id, $dialogue->turns[1]->start_s]);
        [$sent] = $api->requests;
        self::assertSame(['/api/v1/tts/dialogue', 'scene-1', 'audio/wav, application/json'], [$sent->getRequestTarget(), $sent->getHeaderLine('idempotency-key'), $sent->getHeaderLine('accept')]);
        self::assertSame('{"turns":[{"voice_id":"uz-sardor","text":"Salom!"},{"voice_id":"uz-malika","text":"Assalomu alaykum!","speed":1.1}],"gap_ms":300}', (string) $sent->getBody());
    }

    public function test_a_job_s_audio_is_fetched_by_its_id_with_no_idempotency_key_and_retried_as_a_read(): void
    {
        $api = new MockClient(NetworkError::reset(), Replies::audio());
        $speech = (new Tts((new TestHttp($api))->http))->jobs->audio('job-1');
        self::assertSame(self::WAV, $speech->audio);
        self::assertCount(2, $api->requests);
        [$sent] = $api->requests;
        self::assertSame(['GET', '/api/v1/tts/jobs/job-1/audio', 'audio/wav, application/json', false], [$sent->getMethod(), $sent->getRequestTarget(), $sent->getHeaderLine('accept'), $sent->hasHeader('idempotency-key')]);
    }

    public function test_a_job_s_audio_past_its_24_hours_throws_gone_exception(): void
    {
        try {
            Clients::on(new MockClient(Replies::apiError(410, 'audio_expired')))->tts->jobs->audio('job-1');
            self::fail('The audio should have been gone.');
        } catch (GoneException $error) {
            self::assertSame([410, 'audio_expired'], [$error->status, $error->error_code]);
        }
    }

    /** @param \Closure(NeuronAI): mixed $call */
    #[DataProvider('audioCalls')]
    public function test_each_audio_call_throws_api_exception_for_a_200_that_isn_t_audio_with_the_key_kept_out(\Closure $call): void
    {
        $api = new MockClient(new Response(200, ['content-type' => 'text/html'], '<html>Sign in to the Wi-Fi. Bearer ' . TestHttp::KEY . '</html>'), Replies::audio());
        try {
            $call(new NeuronAI(['api_key' => TestHttp::KEY, 'http_client' => $api]));
            self::fail('The page should have been refused.');
        } catch (APIException $error) {
            self::assertSame([200, 'OK: <html>Sign in to the Wi-Fi. Bearer [redacted]</html>'], [$error->status, $error->getMessage()]);
            self::assertNotSame([], Frames::sdk($error));
            self::assertStringNotContainsString(TestHttp::KEY, Frames::printed($error));
        }
        self::assertCount(1, $api->requests);
    }

    /** @return iterable<string, array{\Closure(NeuronAI): mixed}> */
    public static function audioCalls(): iterable
    {
        yield 'tts->synthesize' => [static fn(NeuronAI $client): mixed => $client->tts->synthesize(['text' => 'Salom'])];
        yield 'tts->dialogue' => [static fn(NeuronAI $client): mixed => $client->tts->dialogue(['turns' => [['voice_id' => 'v', 'text' => 'Salom']]])];
        yield 'tts->jobs->audio' => [static fn(NeuronAI $client): mixed => $client->tts->jobs->audio('job-1')];
    }

    public function test_with_raw_response_gives_the_audio_with_its_status_and_headers(): void
    {
        $raw = Clients::on(new MockClient(Replies::audio(), Replies::audio(self::WAV, ['x-turn-count' => '1']), Replies::audio()))->withRawResponse();
        $speech = $raw->tts->synthesize(['text' => 'Salom']);
        $dialogue = $raw->tts->dialogue(['turns' => [['voice_id' => 'v', 'text' => 'Salom']]]);
        $job = $raw->tts->jobs->audio('job-1');
        self::assertSame([self::WAV, 200, '12.5'], [$speech->data->audio, $speech->status, $speech->headers['x-cost'] ?? null]);
        self::assertSame([1, '1'], [$dialogue->data->turn_count, $dialogue->headers['x-turn-count'] ?? null]);
        self::assertSame([200, 'req-audio'], [$job->status, $job->data->request_id]);
    }
}
