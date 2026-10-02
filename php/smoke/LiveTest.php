<?php

declare(strict_types=1);

namespace Naiuz\Smoke;

use Naiuz\NeuronAI;
use PHPUnit\Framework\TestCase;

/**
 * The live API, called as a user calls it: run apart from the unit tests, with vendor/bin/phpunit --testsuite smoke.
 *
 * It needs a restricted key of a test organization with a small balance, in NEURONAI_SMOKE_API_KEY. Without one, every
 * test here is skipped. The tests run in order, and each uses what the ones before it found.
 */
final class LiveTest extends TestCase
{
    private static string $voiceId = '';

    private static string $speech = '';

    private NeuronAI $client;

    protected function setUp(): void
    {
        $key = trim((string) getenv('NEURONAI_SMOKE_API_KEY'));
        if ($key === '') {
            self::markTestSkipped("NEURONAI_SMOKE_API_KEY isn't set.");
        }
        $this->client = new NeuronAI(['api_key' => $key]);
    }

    public function test_it_reads_the_balance(): void
    {
        $balance = $this->client->account->balance();
        self::assertTrue(is_finite($balance->balance));
        self::assertNotSame('', $balance->currency);
    }

    public function test_it_lists_voices(): void
    {
        $page = $this->client->voices->list(['type' => 'stock', 'language' => 'uz', 'limit' => 5]);
        self::assertNotSame([], $page->data);
        self::$voiceId = $page->data[0]->id;
    }

    public function test_it_synthesizes_a_short_line(): void
    {
        self::assertNotSame('', self::$voiceId, 'The voice list gave a voice.');
        $speech = $this->client->tts->synthesize(['text' => 'Assalomu alaykum! Bu sinov.', 'voice_id' => self::$voiceId, 'language' => 'uz']);
        self::assertStringStartsWith('RIFF', $speech->audio);
        self::assertSame('audio/wav', $speech->content_type);
        self::assertNotNull($speech->cost);
        self::assertNotNull($speech->request_id);
        self::$speech = $speech->audio;
    }

    public function test_it_transcribes_a_clip_the_synthesized_line(): void
    {
        self::assertNotSame('', self::$speech, 'The synthesis gave audio.');
        $stream = fopen('php://temp', 'w+b');
        self::assertIsResource($stream);
        fwrite($stream, self::$speech);
        $transcription = $this->client->stt->transcribe(['file' => ['stream' => $stream, 'filename' => 'smoke.wav'], 'language' => 'uz']);
        self::assertGreaterThan(0.0, $transcription->duration_seconds);
    }

    public function test_it_waits_for_a_synthesis_job_and_downloads_its_audio(): void
    {
        $job = $this->client->tts->jobs->createAndWait(['text' => 'Salom!', 'voice_id' => self::$voiceId, 'language' => 'uz'], ['poll_interval' => 1, 'timeout' => 120]);
        self::assertSame('succeeded', $job->status);
        self::assertStringStartsWith('RIFF', $this->client->tts->jobs->audio($job->id)->audio);
    }

    public function test_it_streams_a_chat_completion(): void
    {
        $models = $this->client->models->list();
        self::assertNotSame([], $models->data, 'The model list gave a model.');
        $stream = $this->client->chat->completions->create([
            'model' => $models->data[0]->id,
            'messages' => [['role' => 'user', 'content' => "Salom! Bir so'z bilan javob ber."]],
            'max_tokens' => 16,
            'stream' => true,
        ]);
        $chunks = 0;
        $text = '';
        foreach ($stream as $chunk) {
            $chunks++;
            $text .= $chunk->choices[0]->delta->content ?? '';
        }
        self::assertGreaterThan(0, $chunks);
        self::assertNotSame('', $text);
    }
}
