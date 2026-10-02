<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Exceptions\APIConnectionException;
use Naiuz\Exceptions\InternalServerException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Exceptions\NotFoundException;
use Naiuz\Exceptions\UnprocessableEntityException;
use Naiuz\Resources\Voices;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\FormParser;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Types\Voice;
use Naiuz\Types\VoiceCategory;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\ResponseInterface;

final class VoicesTest extends TestCase
{
    private const WAV = "RIFF\x24\x00\x00\x00WAVEfmt ";

    private ?string $path = null;

    protected function tearDown(): void
    {
        if ($this->path !== null && is_file($this->path)) {
            unlink($this->path);
        }
        parent::tearDown();
    }

    public function test_list_sends_no_query_when_given_none_and_the_query_it_is_given(): void
    {
        $api = new MockClient(self::page(['a'], null), self::page(['b'], null));
        $client = Clients::on($api);
        $client->voices->list();
        $client->voices->list(['type' => 'stock', 'language' => 'uz', 'limit' => 100, 'cursor' => 'c1']);
        self::assertSame('/api/v1/tts/voices', $api->requests[0]->getRequestTarget());
        self::assertSame('/api/v1/tts/voices?type=stock&language=uz&limit=100&cursor=c1', $api->requests[1]->getRequestTarget());
    }

    public function test_list_walks_every_voice_across_pages(): void
    {
        $ids = [];
        foreach (Clients::on(new MockClient(self::page(['a', 'b'], 'c2'), self::page(['c'], null)))->voices->list(['limit' => 2]) as $voice) {
            $ids[] = $voice->id;
        }
        self::assertSame(['a', 'b', 'c'], $ids);
    }

    public function test_list_sends_a_limit_outside_1_to_100_as_given_and_throws_the_api_s_422(): void
    {
        $api = new MockClient(Replies::apiError(422, 'invalid_request'));
        $this->expectException(UnprocessableEntityException::class);
        try {
            Clients::on($api)->voices->list(['limit' => 0]);
        } finally {
            self::assertSame('limit=0', $api->requests[0]->getUri()->getQuery());
        }
    }

    public function test_retrieve_reads_one_voice_with_its_request_id(): void
    {
        $api = new MockClient(Replies::envelope(self::voice('uz-sardor'), 'req-voice'));
        $found = Clients::on($api)->voices->retrieve('uz-sardor');
        self::assertSame(['uz-sardor', 'req-voice'], [$found->id, $found->request_id]);
        self::assertSame('/api/v1/tts/voices/uz-sardor', $api->requests[0]->getRequestTarget());
    }

    #[DataProvider('idsNamingAnotherEndpoint')]
    public function test_retrieve_refuses_an_empty_or_dot_segment_id_without_sending_anything(string $id): void
    {
        $api = new MockClient();
        try {
            Clients::on($api)->voices->retrieve($id);
            self::fail('The id should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertStringStartsWith('The path parameter "id" must be a non-empty string', $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    /** @return iterable<string, array{string}> */
    public static function idsNamingAnotherEndpoint(): iterable
    {
        yield 'empty' => [''];
        yield 'dot' => ['.'];
        yield 'dot dot' => ['..'];
    }

    public function test_update_sends_only_the_keys_passed_with_null_as_null(): void
    {
        $api = new MockClient(Replies::envelope(self::voice('v1')), Replies::envelope(self::voice('v1')));
        $client = Clients::on($api);
        $client->voices->update('v1', ['name' => 'Support voice', 'tags' => null]);
        $client->voices->update('v1', ['ref_text' => '']);
        self::assertSame(['PATCH', '/api/v1/tts/voices/v1'], [$api->requests[0]->getMethod(), $api->requests[0]->getRequestTarget()]);
        self::assertSame('{"name":"Support voice","tags":null}', (string) $api->requests[0]->getBody());
        self::assertSame('{"ref_text":""}', (string) $api->requests[1]->getBody());
    }

    public function test_update_sends_every_field_it_is_given_a_category_case_as_its_value(): void
    {
        $api = new MockClient(Replies::envelope(self::voice('v1')));
        Clients::on($api)->voices->update('v1', ['name' => 'Support voice', 'category' => VoiceCategory::Conversational, 'language' => 'ru', 'ref_text' => null, 'tags' => ['support']]);
        self::assertSame('{"name":"Support voice","category":"conversational","language":"ru","ref_text":null,"tags":["support"]}', (string) $api->requests[0]->getBody());
    }

    public function test_update_refuses_a_key_it_doesn_t_take_such_as_a_camel_case_one_sending_nothing(): void
    {
        $api = new MockClient();
        try {
            // PHPStan lets an array shape take keys it doesn't name, so only the SDK can catch this one.
            Clients::on($api)->voices->update('v1', ['refText' => 'Salom']);
            self::fail('The key should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame('voices->update() takes no parameter "refText": it takes name, category, language, ref_text and tags.', $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    public function test_delete_returns_nothing_for_a_204_and_sends_no_body(): void
    {
        $api = new MockClient(Replies::noContent(['x-request-id' => 'req-delete']));
        Clients::on($api)->voices->delete('v1');
        self::assertSame(['DELETE', ''], [$api->requests[0]->getMethod(), (string) $api->requests[0]->getBody()]);
    }

    public function test_the_api_s_404_throws_not_found_exception(): void
    {
        $this->expectException(NotFoundException::class);
        Clients::on(new MockClient(Replies::apiError(404, 'not_found')))->voices->retrieve('no-such-voice');
    }

    public function test_list_retrieve_and_delete_retry_a_reset_as_safe_calls_do_and_update_doesn_t(): void
    {
        $api = new MockClient(NetworkError::reset(), self::page([], null), NetworkError::reset(), Replies::envelope(self::voice('v1')), NetworkError::reset(), Replies::noContent(), NetworkError::reset());
        $voices = new Voices((new TestHttp($api, maxRetries: 1))->http);
        $voices->list();
        $voices->retrieve('v1');
        $voices->delete('v1');
        try {
            $voices->update('v1', ['name' => 'x']);
            self::fail('The update should not have been retried.');
        } catch (NeuronAIException $error) {
            self::assertSame('Connection error: Connection reset by peer', $error->getMessage());
        }
        self::assertCount(7, $api);
    }

    public function test_update_retries_a_5xx_in_the_api_s_envelope_but_not_a_gateway_s_bare_502(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable'), Replies::envelope(self::voice('v1')), new Response(502, [], '<html>Bad Gateway</html>'));
        $voices = new Voices((new TestHttp($api, maxRetries: 1))->http);
        self::assertSame('v1', $voices->update('v1', ['ref_text' => 'Salom'])->id);
        $this->expectException(InternalServerException::class);
        try {
            $voices->update('v1', ['ref_text' => 'Salom']);
        } finally {
            self::assertCount(3, $api);
        }
    }

    public function test_with_raw_response_gives_a_list_s_first_page_and_a_delete_s_204(): void
    {
        $raw = Clients::on(new MockClient(self::page(['a'], null), Replies::noContent()))->withRawResponse();
        $listed = $raw->voices->list();
        $deleted = $raw->voices->delete('v1');
        self::assertSame([['a'], 200], [array_map(static fn(Voice $voice): string => $voice->id, $listed->data->data), $listed->status]);
        self::assertSame([null, 204], [$deleted->data, $deleted->status]);
    }

    public function test_a_voice_may_leave_out_category_ref_text_and_created_at_and_have_a_type_the_sdk_doesn_t_know(): void
    {
        $found = Voice::from(['id' => 'v', 'name' => 'V', 'language' => 'uz', 'tags' => [], 'type' => 'shared']);
        self::assertSame([null, null, null, 'shared'], [$found->category, $found->ref_text, $found->created_at, $found->type]);
        self::assertSame(['id' => 'v', 'name' => 'V', 'language' => 'uz', 'tags' => [], 'type' => 'shared'], $found->toArray());
    }

    public function test_create_sends_a_clip_from_a_path_in_a_multipart_form_with_an_idempotency_key(): void
    {
        $api = new MockClient(Replies::envelope(self::voice('v-new'), 'req-voice', 201));
        $path = $this->sample();
        $voice = Clients::on($api)->voices->create(['name' => 'Office voice', 'language' => 'uz', 'ref_audio' => $path, 'ref_text' => "Salom.\nRahmat.", 'category' => VoiceCategory::Conversational, 'tags' => ['support', 'calm']], ['idempotency_key' => 'voice-1']);
        self::assertSame(['v-new', 'req-voice'], [$voice->id, $voice->request_id]);
        [$sent] = $api->requests;
        self::assertSame(['POST', '/api/v1/tts/voices', 'voice-1'], [$sent->getMethod(), $sent->getRequestTarget(), $sent->getHeaderLine('idempotency-key')]);
        self::assertSame([
            'fields' => ['name' => 'Office voice', 'language' => 'uz', 'ref_text' => "Salom.\r\nRahmat.", 'category' => 'conversational', 'tags' => ['support', 'calm']],
            'files' => ['ref_audio' => ['filename' => basename($path), 'content_type' => 'audio/wav', 'base64' => base64_encode(self::WAV)]],
        ], FormParser::parse($sent));
    }

    public function test_create_refuses_a_stream_without_its_filename_sending_nothing(): void
    {
        $api = new MockClient();
        $stream = fopen('php://temp', 'w+b');
        self::assertIsResource($stream);
        try {
            // @phpstan-ignore argument.type (an untyped caller's mistake, which the SDK refuses)
            Clients::on($api)->voices->create(['name' => 'Office voice', 'language' => 'uz', 'ref_audio' => $stream]);
            self::fail('The stream should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame("ref_audio needs a filename: pass ['stream' => \$stream, 'filename' => 'clip.wav'] rather than the stream alone.", $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    public function test_create_retries_a_bare_502_and_a_reset_with_the_same_form_and_key(): void
    {
        $api = new MockClient(new Response(502, [], '<html>Bad Gateway</html>'), NetworkError::reset(), Replies::envelope(self::voice('v-new'), status: 201));
        (new Voices((new TestHttp($api))->http))->create(['name' => 'Office voice', 'language' => 'uz', 'ref_audio' => $this->sample()]);
        self::assertCount(3, $api);
        [$first] = $api->requests;
        foreach ($api->requests as $sent) {
            self::assertSame([$first->getHeaderLine('idempotency-key'), (string) $first->getBody()], [$sent->getHeaderLine('idempotency-key'), (string) $sent->getBody()]);
        }
    }

    public function test_replace_audio_sends_the_new_clip_and_retries_only_a_5xx_in_the_api_s_envelope(): void
    {
        $api = new MockClient(NetworkError::reset(), new Response(502, [], '<html>Bad Gateway</html>'), Replies::apiError(503, 'service_unavailable'), Replies::envelope(self::voice('v1')));
        $voices = new Voices((new TestHttp($api, maxRetries: 1))->http);
        $stream = fopen('php://temp', 'w+b');
        self::assertIsResource($stream);
        fwrite($stream, self::WAV);
        $replace = static fn(): Voice => $voices->replaceAudio('v1', ['ref_audio' => ['stream' => $stream, 'filename' => 'take.ogg'], 'ref_text' => 'Yangi namuna.']);
        foreach ([APIConnectionException::class, InternalServerException::class] as $class) {
            try {
                $replace();
                self::fail('The failure should not have been retried.');
            } catch (NeuronAIException $error) {
                self::assertSame($class, $error::class);
            }
        }
        self::assertSame('v1', $replace()->id);
        self::assertCount(4, $api);
        [$sent] = $api->requests;
        self::assertSame(['POST', '/api/v1/tts/voices/v1/audio', false], [$sent->getMethod(), $sent->getRequestTarget(), $sent->hasHeader('idempotency-key')]);
        self::assertSame(['fields' => ['ref_text' => 'Yangi namuna.'], 'files' => ['ref_audio' => ['filename' => 'take.ogg', 'content_type' => 'audio/ogg', 'base64' => base64_encode(self::WAV)]]], FormParser::parse($sent));
    }

    public function test_with_raw_response_gives_a_created_voice_with_its_201(): void
    {
        $raw = Clients::on(new MockClient(Replies::envelope(self::voice('v-new'), status: 201)))->withRawResponse()->voices->create(['name' => 'Office voice', 'language' => 'uz', 'ref_audio' => $this->sample()]);
        self::assertSame(['v-new', 201], [$raw->data->id, $raw->status]);
    }

    /** @return array<string, mixed> */
    private static function voice(string $id): array
    {
        return ['id' => $id, 'name' => $id, 'language' => 'uz', 'tags' => [], 'type' => 'custom', 'category' => null, 'ref_text' => null];
    }

    /** @param list<string> $ids */
    private static function page(array $ids, ?string $nextCursor): ResponseInterface
    {
        return Replies::json(200, ['data' => array_map(self::voice(...), $ids), 'next_cursor' => $nextCursor, 'request_id' => 'req-page']);
    }

    /** A short WAV file on disk, removed after the test. */
    private function sample(): string
    {
        $this->path = sys_get_temp_dir() . '/naiuz-sample-' . bin2hex(random_bytes(4)) . '.wav';
        file_put_contents($this->path, self::WAV);

        return $this->path;
    }
}
