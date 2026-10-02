<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Core\Answer;
use Naiuz\Core\Attempt;
use Naiuz\Core\Readers;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Types\DialogueAudio;
use Naiuz\Types\DialogueTurnTiming;
use Naiuz\Types\SpeechAudio;
use PHPUnit\Framework\Attributes\DataProvider;

final class AudioTest extends TestCase
{
    private const WAV = "RIFF\x24\x00\x00\x00WAVEfmt ";

    private const HEADERS = [
        'content-type' => 'audio/wav',
        'x-cost' => '12.5',
        'x-balance' => '9987.5',
        'x-character-count' => '5',
        'x-voice-custom' => '1',
        'x-latency-ms' => '820.5',
        'idempotency-replayed' => '1',
        'x-request-id' => 'req-speech',
    ];

    private const TURNS = '[{"index":0,"voice_id":"uz-sardor","start_s":0,"end_s":0.8,"duration_s":0.8},{"index":1,"voice_id":"uz-malika","start_s":1.1,"end_s":2.4,"duration_s":1.3}]';

    private ?string $path = null;

    protected function tearDown(): void
    {
        if ($this->path !== null && is_file($this->path)) {
            unlink($this->path);
        }
        parent::tearDown();
    }

    public function test_speech_reads_the_wav_and_what_each_header_says(): void
    {
        $speech = self::speech(self::HEADERS);
        self::assertSame(
            [self::WAV, 'audio/wav', 12.5, 5, 9987.5, true, 820.5, true, 'req-speech'],
            [$speech->audio, $speech->content_type, $speech->cost, $speech->character_count, $speech->balance, $speech->voice_custom, $speech->latency_ms, $speech->replayed, $speech->request_id],
        );
    }

    public function test_a_header_left_out_gives_null_for_a_number_and_false_for_a_flag(): void
    {
        $speech = self::speech(['content-type' => 'audio/wav']);
        self::assertSame(
            [null, null, null, false, null, false, null],
            [$speech->cost, $speech->character_count, $speech->balance, $speech->voice_custom, $speech->latency_ms, $speech->replayed, $speech->request_id],
        );
    }

    /** @param array<string, string> $headers */
    #[DataProvider('headersThatDontRead')]
    public function test_a_header_that_doesn_t_read_as_its_kind_gives_null_or_false(array $headers): void
    {
        $speech = self::speech(['content-type' => 'audio/wav', ...$headers]);
        self::assertSame([null, null, false, false], [$speech->cost, $speech->character_count, $speech->voice_custom, $speech->replayed]);
    }

    /** @return iterable<string, array{array<string, string>}> */
    public static function headersThatDontRead(): iterable
    {
        yield 'words' => [['x-cost' => 'free', 'x-character-count' => 'five', 'x-voice-custom' => 'yes', 'idempotency-replayed' => 'true']];
        yield 'a count with a fraction, and a flag of 0' => [['x-character-count' => '5.0', 'x-voice-custom' => '0', 'idempotency-replayed' => '0']];
        yield 'a negative count, and a number past a float' => [['x-character-count' => '-5', 'x-cost' => '1e999']];
    }

    public function test_dialogue_reads_where_each_turn_sits_and_how_many_there_are(): void
    {
        $dialogue = self::dialogue([...self::HEADERS, 'x-turns' => self::TURNS, 'x-turn-count' => '2']);
        self::assertSame([12.5, 2, 2], [$dialogue->cost, $dialogue->turn_count, count($dialogue->turns)]);
        [$first, $second] = $dialogue->turns;
        self::assertSame([0, 'uz-sardor', 0.0, 0.8, 0.8], [$first->index, $first->voice_id, $first->start_s, $first->end_s, $first->duration_s]);
        self::assertSame(['index' => 1, 'voice_id' => 'uz-malika', 'start_s' => 1.1, 'end_s' => 2.4, 'duration_s' => 1.3], $second->toArray());
    }

    #[DataProvider('turnsThatDontRead')]
    public function test_turns_are_empty_unless_the_whole_header_is_a_list_of_turns(?string $turns): void
    {
        $dialogue = self::dialogue(['content-type' => 'audio/wav', ...($turns === null ? [] : ['x-turns' => $turns])]);
        self::assertSame([[], null], [$dialogue->turns, $dialogue->turn_count]);
    }

    /** @return iterable<string, array{string|null}> */
    public static function turnsThatDontRead(): iterable
    {
        yield 'no header' => [null];
        yield 'not JSON' => ['[{"index":0'];
        yield 'an object' => ['{"index":0}'];
        yield 'a turn without its voice' => ['[{"index":0,"start_s":0,"end_s":0.8,"duration_s":0.8}]'];
        yield 'a turn that isn\'t an object' => ['[1]'];
    }

    public function test_a_turn_keeps_a_field_the_sdk_doesn_t_know_yet(): void
    {
        $turn = DialogueTurnTiming::from(['index' => 0, 'voice_id' => 'v', 'start_s' => 0, 'end_s' => 1, 'duration_s' => 1, 'emotion' => 'calm']);
        self::assertSame('calm', $turn->toArray()['emotion'] ?? null);
    }

    public function test_a_success_that_isn_t_audio_throws_api_exception_with_the_key_redacted(): void
    {
        $page = new Answer(200, 'OK', ['content-type' => 'text/html'], '<html>Sign in. Bearer ' . TestHttp::KEY . '</html>');
        foreach ([Readers::speech(), Readers::dialogue()] as $read) {
            try {
                $read($page, self::attempt());
                self::fail('The page should have been refused.');
            } catch (APIException $error) {
                self::assertSame([200, null, 'OK: <html>Sign in. Bearer [redacted]</html>'], [$error->status, $error->error_code, $error->getMessage()]);
            }
        }
    }

    public function test_save_writes_the_wav_replacing_a_file_already_there(): void
    {
        $this->path = sys_get_temp_dir() . '/naiuz-speech-' . bin2hex(random_bytes(4)) . '.wav';
        file_put_contents($this->path, 'an older and longer file');
        self::speech(self::HEADERS)->save($this->path);
        self::assertSame(self::WAV, file_get_contents($this->path));
    }

    public function test_save_throws_naming_the_path_and_why_even_where_warnings_are_turned_into_exceptions(): void
    {
        // As Laravel's and Symfony's error handlers do: the SDK's own exception must still say what happened.
        set_error_handler(static fn(int $level, string $message): never => throw new \ErrorException($message, 0, $level));
        try {
            self::speech(self::HEADERS)->save('/nonexistent/speech.wav');
            self::fail('The audio should not have been written.');
        } catch (NeuronAIException $error) {
            self::assertSame("The audio couldn't be written to /nonexistent/speech.wav: Failed to open stream: No such file or directory", $error->getMessage());
        } finally {
            restore_error_handler();
        }
    }

    public function test_a_dump_shows_the_audio_s_size_not_its_bytes(): void
    {
        $dialogue = self::dialogue([...self::HEADERS, 'x-turns' => self::TURNS]);
        ob_start();
        var_dump($dialogue);
        $dumped = (string) ob_get_clean();
        foreach ([$dumped, print_r($dialogue, true)] as $printed) {
            self::assertStringContainsString('<16 bytes>', $printed);
            self::assertStringContainsString('req-speech', $printed);
            self::assertStringNotContainsString('WAVEfmt', $printed);
        }
    }

    /** @param array<string, string> $headers */
    private static function speech(array $headers): SpeechAudio
    {
        return Readers::speech()(new Answer(200, 'OK', $headers, self::WAV), self::attempt());
    }

    /** @param array<string, string> $headers */
    private static function dialogue(array $headers): DialogueAudio
    {
        return Readers::dialogue()(new Answer(200, 'OK', $headers, self::WAV), self::attempt());
    }

    private static function attempt(): Attempt
    {
        return new Attempt(1.0, new \SensitiveParameterValue(TestHttp::KEY));
    }
}
