<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Client as GuzzleClient;
use Naiuz\Core\Transport\GuzzleTransport;
use Naiuz\Core\Transport\SymfonyTransport;
use Naiuz\Core\Transport\Transport;
use Naiuz\Exceptions\APITimeoutException;
use Naiuz\Resources\Completions;
use Naiuz\Stream;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\LocalServer;
use Naiuz\Types\ChatCompletionChunk;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpClient\HttpClient as SymfonyHttpClient;

/**
 * Streamed chat completions read from a real socket, on Guzzle and on Symfony HttpClient: the timers that bound each
 * wait for a piece, and the hang-up that stops the server, are the HTTP clients' own, which no mocked client can show.
 * CI runs these on Guzzle 7 and 8, and on Symfony HttpClient 5.4 and 7.
 */
final class StreamSocketTest extends TestCase
{
    private const HEAD = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n";

    private const HELLO = ['model' => 'gemma-4-26b-a4b', 'messages' => [['role' => 'user', 'content' => 'Salom!']], 'stream' => true];

    private ?LocalServer $server = null;

    protected function tearDown(): void
    {
        $this->server?->stop();
        parent::tearDown();
    }

    /** @return iterable<string, array{\Closure(): Transport}> */
    public static function transports(): iterable
    {
        yield 'guzzle' => [static fn(): Transport => new GuzzleTransport(new GuzzleClient())];
        yield 'symfony' => [static fn(): Transport => new SymfonyTransport(SymfonyHttpClient::create())];
    }

    /** @param \Closure(): Transport $transport */
    #[DataProvider('transports')]
    public function test_breaking_out_of_the_loop_hangs_up_at_once_while_the_stream_is_kept(\Closure $transport): void
    {
        // The server would go on generating, every 50 ms, until the client hangs up.
        $server = $this->server = LocalServer::repeating(self::HEAD . self::event('Salom'), self::event('!'), 0.05);
        $stream = self::create($transport(), $server->baseUrl, 1.0);
        $read = 0;
        foreach ($stream as $chunk) {
            if (++$read === 3) {
                break;
            }
        }
        $started = microtime(true);
        self::assertTrue($server->hungUp(1.0), 'The server saw the connection closed.');
        self::assertLessThan(0.5, microtime(true) - $started);
        // The stream still lives, and holds nothing open.
        $stream->close();
    }

    /** @param \Closure(): Transport $transport */
    #[DataProvider('transports')]
    public function test_a_stream_that_outlasts_the_timeout_is_read_whole_while_its_pieces_keep_coming(\Closure $transport): void
    {
        $server = $this->server = LocalServer::start(self::HEAD . self::event('a'), 0.1, self::event('b'), self::event('c'), self::event('d'), self::event('e'), self::event('f'), "data: [DONE]\n\n");
        $started = microtime(true);
        self::assertSame('abcdef', self::text(self::create($transport(), $server->baseUrl, 0.3)));
        self::assertGreaterThan(0.5, microtime(true) - $started);
    }

    /** @param \Closure(): Transport $transport */
    #[DataProvider('transports')]
    public function test_a_silence_longer_than_the_timeout_ends_the_stream_with_api_timeout_exception(\Closure $transport): void
    {
        $server = $this->server = LocalServer::start(self::HEAD . self::event('a'));
        $stream = self::create($transport(), $server->baseUrl, 0.3);
        $text = '';
        $thrown = null;
        $started = microtime(true);
        try {
            foreach ($stream as $chunk) {
                $text .= $chunk->choices[0]->delta->content ?? '';
            }
        } catch (APITimeoutException $error) {
            $thrown = $error;
        }
        self::assertSame('a', $text);
        self::assertInstanceOf(APITimeoutException::class, $thrown);
        self::assertSame('No part of the stream arrived within 0.3 s.', $thrown->getMessage());
        self::assertLessThan(0.9, microtime(true) - $started);
    }

    /** @param \Closure(): Transport $transport */
    #[DataProvider('transports')]
    public function test_a_stream_whose_server_holds_the_connection_open_after_done_ends_within_about_the_timeout(\Closure $transport): void
    {
        $server = $this->server = LocalServer::start(self::HEAD . self::event('a') . "data: [DONE]\n\n");
        $started = microtime(true);
        self::assertSame('a', self::text(self::create($transport(), $server->baseUrl, 0.3)));
        self::assertLessThan(0.9, microtime(true) - $started);
    }

    /** @return Stream<ChatCompletionChunk> */
    private static function create(Transport $transport, string $baseUrl, float $timeout): Stream
    {
        return (new Completions(Clients::http($transport, $baseUrl, $timeout)))->create(self::HELLO);
    }

    /** @param Stream<ChatCompletionChunk> $stream */
    private static function text(Stream $stream): string
    {
        $text = '';
        foreach ($stream as $chunk) {
            $text .= $chunk->choices[0]->delta->content ?? '';
        }

        return $text;
    }

    private static function event(string $content): string
    {
        $chunk = ['id' => 'chatcmpl-1', 'object' => 'chat.completion.chunk', 'created' => 1790000000, 'model' => 'gemma-4-26b-a4b', 'choices' => [['index' => 0, 'delta' => ['content' => $content], 'finish_reason' => null]]];

        return 'data: ' . json_encode($chunk, JSON_THROW_ON_ERROR) . "\n\n";
    }
}
