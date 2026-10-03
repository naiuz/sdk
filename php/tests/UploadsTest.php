<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Psr7\Request;
use Naiuz\Core\FilePart;
use Naiuz\Core\Form;
use Naiuz\Core\Multipart;
use Naiuz\Core\Upload;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Tests\Support\DeniedStream;
use Naiuz\Tests\Support\FormParser;
use Naiuz\Tests\Support\LocalServer;
use Naiuz\Types\VoiceCategory;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;

final class UploadsTest extends TestCase
{
    private const WAV = "RIFF\x24\x00\x00\x00WAVEfmt ";

    private ?string $directory = null;

    private ?LocalServer $server = null;

    protected function tearDown(): void
    {
        $this->server?->stop();
        foreach (glob(($this->directory ?? '/nonexistent') . '/*') ?: [] as $file) {
            unlink($file);
        }
        if ($this->directory !== null) {
            rmdir($this->directory);
        }
        parent::tearDown();
    }

    #[DataProvider('extensions')]
    public function test_the_content_type_comes_from_what_follows_the_last_dot(string $filename, string $contentType): void
    {
        self::assertSame($contentType, Upload::contentTypeFor($filename));
    }

    /** @return iterable<string, array{string, string}> */
    public static function extensions(): iterable
    {
        yield 'wav' => ['clip.wav', 'audio/wav'];
        yield 'mp3' => ['clip.mp3', 'audio/mpeg'];
        yield 'ogg' => ['clip.ogg', 'audio/ogg'];
        yield 'flac' => ['clip.flac', 'audio/flac'];
        yield 'm4a' => ['clip.m4a', 'audio/mp4'];
        yield 'webm' => ['clip.webm', 'audio/webm'];
        yield 'upper case' => ['CLIP.WAV', 'audio/wav'];
        yield 'two dots' => ['take.2.mp3', 'audio/mpeg'];
        yield 'another extension' => ['notes.txt', 'application/octet-stream'];
        yield 'no extension' => ['clip', 'application/octet-stream'];
        yield 'a trailing dot' => ['clip.', 'application/octet-stream'];
    }

    public function test_a_path_is_read_and_sent_under_its_last_part(): void
    {
        $path = $this->file('sample.wav', self::WAV);
        self::assertEquals(new FilePart('sample.wav', self::WAV, 'audio/wav'), Upload::read('ref_audio', $path));
    }

    public function test_a_stream_is_sent_under_its_filename_with_the_content_type_declared_else_its_extension_s(): void
    {
        self::assertEquals(new FilePart('clip.mp3', self::WAV, 'audio/mpeg'), Upload::read('file', ['stream' => self::stream(self::WAV), 'filename' => 'clip.mp3']));
        self::assertEquals(new FilePart('clip.mp3', self::WAV, 'audio/wav'), Upload::read('file', ['stream' => self::stream(self::WAV), 'filename' => 'clip.mp3', 'content_type' => 'audio/wav']));
        foreach (['', null] as $none) {
            self::assertSame('audio/mpeg', Upload::read('file', ['stream' => self::stream(self::WAV), 'filename' => 'clip.mp3', 'content_type' => $none])->contentType);
        }
    }

    public function test_a_stream_written_to_and_left_at_its_end_is_read_from_its_start(): void
    {
        $stream = self::stream(self::WAV);
        self::assertSame(strlen(self::WAV), ftell($stream));
        self::assertSame(self::WAV, Upload::read('file', ['stream' => $stream, 'filename' => 'clip.wav'])->content);
        self::assertSame(self::WAV, Upload::read('file', ['stream' => $stream, 'filename' => 'clip.wav'])->content);
    }

    public function test_a_stream_that_can_t_seek_is_read_when_unread_and_refused_once_read_from(): void
    {
        $unread = self::pipe(self::WAV);
        self::assertFalse(stream_get_meta_data($unread)['seekable']);
        self::assertSame(self::WAV, Upload::read('file', ['stream' => $unread, 'filename' => 'clip.wav'])->content);
        $readFrom = self::pipe(self::WAV);
        fread($readFrom, 4);
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage("file's stream has been read from, and can't be rewound to its start: pass it unread, or pass a path.");
        Upload::read('file', ['stream' => $readFrom, 'filename' => 'clip.wav']);
    }

    /** @param \Closure(): mixed $value */
    #[DataProvider('whatCantBeSent')]
    public function test_it_refuses_what_it_can_t_send_saying_what_to_pass(\Closure $value, string $message): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage($message);
        Upload::read('ref_audio', $value());
    }

    /** @return iterable<string, array{\Closure(): mixed, string}> */
    public static function whatCantBeSent(): iterable
    {
        $forms = "ref_audio must be a path, or ['stream' => \$stream, 'filename' => 'clip.wav']";
        yield 'a stream alone' => [static fn(): mixed => self::stream(self::WAV), "ref_audio needs a filename: pass ['stream' => \$stream, 'filename' => 'clip.wav'] rather than the stream alone."];
        yield 'a stream without a filename' => [static fn(): mixed => ['stream' => self::stream(self::WAV)], "ref_audio needs a filename, such as 'clip.wav': its extension names the file's format."];
        yield 'an empty filename' => [static fn(): mixed => ['stream' => self::stream(self::WAV), 'filename' => ''], "ref_audio needs a filename, such as 'clip.wav'"];
        yield 'a filename that isn\'t text' => [static fn(): mixed => ['stream' => self::stream(self::WAV), 'filename' => 7], "ref_audio needs a filename, such as 'clip.wav'"];
        yield 'bytes in place of a stream' => [static fn(): mixed => ['stream' => self::WAV, 'filename' => 'clip.wav'], "ref_audio's stream must be an open stream, such as fopen(\$path, 'rb')."];
        yield 'a closed stream' => [static function (): mixed {
            $stream = self::stream(self::WAV);
            fclose($stream);

            return ['stream' => $stream, 'filename' => 'clip.wav'];
        }, "ref_audio's stream must be an open stream"];
        yield 'a stream open for writing only' => [static fn(): mixed => ['stream' => fopen('php://output', 'wb'), 'filename' => 'clip.wav'], "ref_audio's stream is open for writing only: open it for reading, such as fopen(\$path, 'rb')."];
        yield 'a key it doesn\'t take' => [static fn(): mixed => ['contents' => self::WAV, 'filename' => 'clip.wav'], 'ref_audio takes no key "contents": it takes stream, filename and content_type.'];
        yield 'a content type with a line break' => [static fn(): mixed => ['stream' => self::stream(self::WAV), 'filename' => 'clip.wav', 'content_type' => "audio/wav\r\nX-Evil: 1"], "ref_audio's content_type must be text a header can carry, such as 'audio/wav'."];
        yield 'an empty path' => [static fn(): mixed => '', "{$forms}: this string isn't a path."];
        yield 'a number' => [static fn(): mixed => 42, "{$forms}."];
        yield 'a file object' => [static fn(): mixed => new \SplFileInfo(__FILE__), "{$forms}."];
    }

    public function test_a_string_of_bytes_is_refused_as_no_path_without_quoting_it(): void
    {
        try {
            Upload::read('file', self::WAV . "\x01\x02 secret");
            self::fail('The bytes should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame("file must be a path, or ['stream' => \$stream, 'filename' => 'clip.wav']: this string isn't a path. To upload bytes you hold, write them to a stream, such as fopen('php://temp', 'w+b'), and pass it with a filename.", $error->getMessage());
        }
    }

    #[DataProvider('stringsThatCantBePaths')]
    public function test_a_string_too_long_or_not_utf8_to_be_a_path_is_refused_as_no_path(string $bytes): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage("file must be a path, or ['stream' => \$stream, 'filename' => 'clip.wav']: this string isn't a path.");
        Upload::read('file', $bytes);
    }

    /** @return iterable<string, array{string}> */
    public static function stringsThatCantBePaths(): iterable
    {
        yield 'longer than the longest path' => [str_repeat('a', PHP_MAXPATHLEN + 1)];
        yield 'not UTF-8' => ["\xff\xfeclip.wav"];
    }

    public function test_a_path_that_can_t_be_read_is_refused_naming_it_and_why(): void
    {
        $this->directory = $this->temporaryDirectory();
        foreach (["{$this->directory}/missing.wav" => 'Failed to open stream: No such file or directory', $this->directory => 'Is a directory'] as $path => $why) {
            try {
                Upload::read('file', $path);
                self::fail("{$path} should have been refused.");
            } catch (NeuronAIException $error) {
                self::assertSame("file couldn't be read from {$path}: {$why}", $error->getMessage());
            }
        }
    }

    public function test_an_error_handler_that_throws_on_warnings_never_sees_a_file_that_can_t_be_read(): void
    {
        // As Laravel's and Symfony's do: the SDK's own exception must still say what happened.
        set_error_handler(static fn(int $level, string $message): never => throw new \ErrorException($message, 0, $level));
        try {
            $this->expectException(NeuronAIException::class);
            $this->expectExceptionMessage("file couldn't be read from /nonexistent/clip.wav: Failed to open stream: No such file or directory");
            Upload::read('file', '/nonexistent/clip.wav');
        } finally {
            restore_error_handler();
        }
    }

    #[RunInSeparateProcess]
    public function test_an_error_handler_that_throws_on_warnings_never_sees_a_path_open_basedir_refuses(): void
    {
        // Shared hosts often set open_basedir, and PHP warns for each file call on a path outside it. It can only be
        // tightened, so this test runs in a process of its own.
        ini_set('open_basedir', implode(PATH_SEPARATOR, [dirname(__DIR__), sys_get_temp_dir()]));
        set_error_handler(static fn(int $level, string $message): never => throw new \ErrorException($message, 0, $level));
        try {
            $this->expectException(NeuronAIException::class);
            $this->expectExceptionMessage("file couldn't be read from /nonexistent/clip.wav: open_basedir restriction in effect");
            Upload::read('file', '/nonexistent/clip.wav');
        } finally {
            restore_error_handler();
        }
    }

    public function test_a_stream_wrapper_s_own_warning_is_the_reason_and_reaches_no_other_handler(): void
    {
        // A userland stream wrapper, such as an S3 client's, says why it can't open a file with E_USER_WARNING.
        stream_wrapper_register(DeniedStream::PROTOCOL, DeniedStream::class);
        error_clear_last();
        try {
            Upload::read('file', 'naiuz-denied://bucket/clip.wav');
            self::fail('The file should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame("file couldn't be read from naiuz-denied://bucket/clip.wav: Access denied to bucket/clip.wav", $error->getMessage());
            // PHP's own handler records each warning left to it: none was.
            self::assertNull(error_get_last());
        } finally {
            stream_wrapper_unregister(DeniedStream::PROTOCOL);
        }
    }

    public function test_the_body_is_what_a_browser_sends(): void
    {
        $form = new Form(['name' => 'Office voice', 'ref_audio' => ['stream' => self::stream(self::WAV), 'filename' => 'sample.wav'], 'tags' => ['support', 'calm']], ['ref_audio']);
        [$body, $contentType] = Multipart::encode($form, 'b0undary');
        self::assertSame('multipart/form-data; boundary=b0undary', $contentType);
        self::assertSame(
            "--b0undary\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nOffice voice\r\n"
            . "--b0undary\r\nContent-Disposition: form-data; name=\"ref_audio\"; filename=\"sample.wav\"\r\nContent-Type: audio/wav\r\n\r\n" . self::WAV . "\r\n"
            . "--b0undary\r\nContent-Disposition: form-data; name=\"tags[]\"\r\n\r\nsupport\r\n"
            . "--b0undary\r\nContent-Disposition: form-data; name=\"tags[]\"\r\n\r\ncalm\r\n"
            . "--b0undary--\r\n",
            $body,
        );
    }

    public function test_text_sends_each_line_break_as_crlf_but_a_file_s_bytes_and_its_filename_as_they_are(): void
    {
        $bytes = "RIFF\n\r\n\rWAVE";
        $form = new Form(['ref_text' => "Salom.\nMen.\rRahmat.\r\nXayr.", 'tags' => ["a\nb"], 'ref_audio' => ['stream' => self::stream($bytes), 'filename' => "two\nlines.wav"]], ['ref_audio']);
        $sent = self::parsed(...Multipart::encode($form));
        self::assertSame(['ref_text' => "Salom.\r\nMen.\r\nRahmat.\r\nXayr.", 'tags' => ["a\r\nb"]], $sent['fields']);
        self::assertSame(['filename' => 'two%0Alines.wav', 'content_type' => 'audio/wav', 'base64' => base64_encode($bytes)], $sent['files']['ref_audio']);
    }

    public function test_a_list_goes_as_repeated_parts_an_empty_one_and_a_null_as_none(): void
    {
        $form = new Form(['tags' => [], 'ref_text' => null, 'category' => null, 'language' => 'uz'], []);
        self::assertSame(['fields' => ['language' => 'uz'], 'files' => []], self::parsed(...Multipart::encode($form)));
    }

    public function test_a_value_that_isn_t_text_goes_as_json_and_an_enum_as_its_value(): void
    {
        $form = new Form(['category' => VoiceCategory::SocialMedia, 'count' => 2, 'flag' => true, 'speed' => 1.5], []);
        self::assertSame(['category' => 'social_media', 'count' => '2', 'flag' => 'true', 'speed' => '1.5'], self::parsed(...Multipart::encode($form))['fields']);
    }

    public function test_names_and_filenames_send_quotes_and_line_breaks_escaped(): void
    {
        $form = new Form(["a\"b\r\nc" => 'x', 'ref_audio' => ['stream' => self::stream(self::WAV), 'filename' => "say \"hi\"\r.wav"]], ['ref_audio']);
        [$body] = Multipart::encode($form, 'b0undary');
        self::assertStringContainsString('name="a%22b%0D%0Ac"', $body);
        self::assertStringContainsString('filename="say %22hi%22%0D.wav"', $body);
    }

    public function test_each_form_gets_its_own_boundary(): void
    {
        $form = new Form(['language' => 'uz'], []);
        self::assertNotSame(Multipart::encode($form)[1], Multipart::encode($form)[1]);
        self::assertMatchesRegularExpression('/^multipart\/form-data; boundary=[0-9a-f]{32}$/', Multipart::encode($form)[1]);
    }

    public function test_a_large_upload_holds_about_its_own_size_while_it_is_built(): void
    {
        $size = 20 * 1024 * 1024;
        $path = $this->file('long.wav', str_repeat("\x01", $size));
        memory_reset_peak_usage();
        $before = memory_get_usage();
        [$body] = Multipart::encode(new Form(['file' => $path, 'language' => 'uz'], ['file']));
        $peak = memory_get_peak_usage() - $before;
        self::assertGreaterThan($size, strlen($body));
        // The file's bytes, then the body that holds them: about twice the file at the peak, never a third copy.
        self::assertLessThan(2.5 * $size, $peak);
    }

    public function test_php_s_own_form_parser_reads_the_form_as_sent(): void
    {
        $this->server = LocalServer::php(__DIR__ . '/Support/form_echo.php');
        $form = new Form([
            'name' => 'Office voice',
            'ref_text' => "Salom.\nRahmat.",
            'tags' => ['support', 'calm'],
            'ref_audio' => ['stream' => self::stream(self::WAV), 'filename' => 'qo‘shiq.wav'],
        ], ['ref_audio']);
        [$body, $contentType] = Multipart::encode($form);
        $answer = (new GuzzleClient())->send(new Request('POST', $this->server->baseUrl, ['content-type' => $contentType], $body));
        $read = json_decode((string) $answer->getBody(), true, flags: JSON_THROW_ON_ERROR);
        self::assertSame([
            'fields' => ['name' => 'Office voice', 'ref_text' => "Salom.\r\nRahmat.", 'tags' => ['support', 'calm']],
            'files' => ['ref_audio' => ['name' => 'qo‘shiq.wav', 'type' => 'audio/wav', 'base64' => base64_encode(self::WAV)]],
        ], $read);
    }

    /**
     * A stream holding $bytes, written to and left at its end.
     *
     * @return resource
     */
    private static function stream(string $bytes)
    {
        $stream = fopen('php://temp', 'w+b');
        self::assertIsResource($stream);
        fwrite($stream, $bytes);

        return $stream;
    }

    /**
     * A stream that can't seek, holding $bytes: one end of a socket pair, whose other end wrote them and hung up.
     *
     * @return resource
     */
    private static function pipe(string $bytes)
    {
        $ends = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
        $reader = $ends[0] ?? null;
        $writer = $ends[1] ?? null;
        self::assertIsResource($reader);
        self::assertIsResource($writer);
        fwrite($writer, $bytes);
        fclose($writer);

        return $reader;
    }

    /**
     * A sent form, parsed.
     *
     * @return array{fields: array<string, string|list<string>>, files: array<string, array{filename: string, content_type: string, base64: string}>}
     */
    private static function parsed(string $body, string $contentType): array
    {
        return FormParser::parse(new Request('POST', 'https://my.neuronai.uz/api/v1/tts/voices', ['content-type' => $contentType], $body));
    }

    private function file(string $name, string $bytes): string
    {
        $this->directory ??= $this->temporaryDirectory();
        $path = "{$this->directory}/{$name}";
        file_put_contents($path, $bytes);

        return $path;
    }

    private function temporaryDirectory(): string
    {
        $directory = sys_get_temp_dir() . '/naiuz-uploads-' . bin2hex(random_bytes(4));
        mkdir($directory);

        return $directory;
    }
}
