<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Resources\Stt;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\DripStream;
use Naiuz\Tests\Support\FormParser;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Types\Transcription;
use Naiuz\Types\TranscriptionSegment;
use Psr\Http\Message\RequestInterface;

final class SttTest extends TestCase
{
    private const WAV = "RIFF\x24\x00\x00\x00WAVEfmt ";

    private const TRANSCRIPTION = [
        'text' => 'Salom dunyo',
        'language' => 'uz',
        'duration_seconds' => 2,
        'segments' => [['start' => 0, 'end' => 2, 'text' => 'Salom dunyo']],
        'cost' => 16.67,
        'balance' => 9983.33,
    ];

    public function test_transcribe_sends_the_file_and_its_language_and_returns_the_transcription(): void
    {
        $api = new MockClient(Replies::envelope(self::TRANSCRIPTION, 'req-stt'));
        $transcription = Clients::on($api)->stt->transcribe(['file' => ['stream' => self::stream(), 'filename' => 'call.mp3', 'content_type' => 'audio/mpeg'], 'language' => 'uz'], ['idempotency_key' => 'call-1']);
        self::assertSame(['Salom dunyo', 2.0, 16.67, 9983.33, 'req-stt'], [$transcription->text, $transcription->duration_seconds, $transcription->cost, $transcription->balance, $transcription->request_id]);
        self::assertSame([[0.0, 2.0, 'Salom dunyo']], array_map(static fn(TranscriptionSegment $segment): array => [$segment->start, $segment->end, $segment->text], $transcription->segments));
        [$sent] = $api->requests;
        self::assertSame(['POST', '/api/v1/stt/transcribe', 'call-1'], [$sent->getMethod(), $sent->getRequestTarget(), $sent->getHeaderLine('idempotency-key')]);
        self::assertSame(['fields' => ['language' => 'uz'], 'files' => ['file' => ['filename' => 'call.mp3', 'content_type' => 'audio/mpeg', 'base64' => base64_encode(self::WAV)]]], FormParser::parse($sent));
    }

    public function test_transcribe_refuses_the_file_s_bytes_passed_as_a_string_sending_nothing(): void
    {
        $api = new MockClient();
        try {
            // A synthesized clip's bytes, passed where a path goes: a string is read as a path, and these bytes aren't one.
            Clients::on($api)->stt->transcribe(['file' => self::WAV, 'language' => 'uz']);
            self::fail('The bytes should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertStringStartsWith("file must be a path, or ['stream' => \$stream, 'filename' => 'clip.wav']: this string isn't a path.", $error->getMessage());
            self::assertStringNotContainsString('WAVE', $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    public function test_transcribe_retries_a_timeout_with_the_same_bytes_and_key(): void
    {
        $api = new MockClient(Replies::dripping(new DripStream(['{'], gap: 0.02, forever: true)), Replies::envelope(self::TRANSCRIPTION));
        (new Stt((new TestHttp($api, timeout: 0.2))->http))->transcribe(['file' => ['stream' => self::stream(), 'filename' => 'call.wav'], 'language' => 'uz']);
        self::assertCount(2, $api);
        $sent = array_map(static fn(RequestInterface $request): array => [$request->getHeaderLine('idempotency-key'), (string) $request->getBody()], $api->requests);
        self::assertSame($sent[0], $sent[1]);
    }

    public function test_with_raw_response_gives_the_transcription_with_its_status_and_headers(): void
    {
        $raw = Clients::on(new MockClient(Replies::envelope(self::TRANSCRIPTION, 'req-raw')))->withRawResponse()->stt->transcribe(['file' => ['stream' => self::stream(), 'filename' => 'call.wav'], 'language' => 'uz']);
        self::assertSame(['Salom dunyo', 200, 'req-raw'], [$raw->data->text, $raw->status, $raw->headers['x-request-id'] ?? null]);
    }

    public function test_a_transcription_keeps_a_field_the_sdk_doesn_t_know_yet(): void
    {
        $transcription = Transcription::from([...self::TRANSCRIPTION, 'speakers' => 2]);
        self::assertSame(2, $transcription->toArray()['speakers'] ?? null);
    }

    /** @return resource */
    private static function stream()
    {
        $stream = fopen('php://temp', 'w+b');
        self::assertIsResource($stream);
        fwrite($stream, self::WAV);

        return $stream;
    }
}
