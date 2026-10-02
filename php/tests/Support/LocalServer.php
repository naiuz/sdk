<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

/**
 * A local HTTP server on 127.0.0.1, run by server.php in a process of its own: it answers each connection by a plan,
 * then goes silent. It hangs up after 5 seconds, so a client that never times out fails its test instead of hanging
 * it. php() runs PHP's own web server on a script instead.
 */
final class LocalServer
{
    /** @param resource $process */
    private function __construct(private $process, public readonly string $baseUrl) {}

    /** A server that sends $first on each connection, then each of $then a gap apart, then goes silent. */
    public static function start(string $first, float $gap = 0.0, string ...$then): self
    {
        return self::serving(['pieces' => [$first, ...array_values($then)], 'gap' => $gap]);
    }

    /**
     * A server that sends its first connection the first answer, its second the second, and so on, then goes silent on
     * each. The last answer goes to every connection after it.
     */
    public static function answering(string ...$answers): self
    {
        return self::serving(...array_map(static fn(string $answer): array => ['pieces' => [$answer], 'gap' => 0.0], array_values($answers)));
    }

    /** The address of a port nothing listens on: connecting to it is refused. */
    public static function refusing(): string
    {
        return 'http://' . self::freeAddress() . '/api/v1';
    }

    /** PHP's own web server, running $script for every request, as the API's server runs PHP. */
    public static function php(string $script): self
    {
        $address = self::freeAddress();
        $process = proc_open([PHP_BINARY, '-S', $address, $script], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        if (!is_resource($process)) {
            throw new \RuntimeException("PHP's web server couldn't start.");
        }
        for ($giveUp = microtime(true) + 5; microtime(true) < $giveUp; usleep(20_000)) {
            $socket = @stream_socket_client("tcp://{$address}", $code, $message, 0.1);
            if ($socket !== false) {
                fclose($socket);

                return new self($process, "http://{$address}/api/v1");
            }
        }
        proc_terminate($process);

        throw new \RuntimeException("PHP's web server didn't start listening.");
    }

    public function stop(): void
    {
        if (is_resource($this->process)) {
            proc_terminate($this->process);
            proc_close($this->process);
        }
    }

    public function __destruct()
    {
        $this->stop();
    }

    /** @param array{pieces: list<string>, gap: float} ...$plans */
    private static function serving(array ...$plans): self
    {
        $arguments = array_map(static fn(array $plan): string => base64_encode(json_encode(['pieces' => array_map(base64_encode(...), $plan['pieces']), 'gap' => $plan['gap']], JSON_THROW_ON_ERROR)), array_values($plans));
        $process = proc_open([PHP_BINARY, __DIR__ . '/server.php', ...$arguments], [1 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) {
            throw new \RuntimeException("The local server couldn't start.");
        }
        $port = trim((string) fgets($pipes[1]));
        if (preg_match('/^\d+$/', $port) !== 1) {
            throw new \RuntimeException("The local server didn't say its port.");
        }

        return new self($process, "http://127.0.0.1:{$port}/api/v1");
    }

    /** An address on 127.0.0.1 whose port nothing listens on. */
    private static function freeAddress(): string
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        if ($socket === false) {
            throw new \RuntimeException("A free port couldn't be found.");
        }
        $name = (string) stream_socket_get_name($socket, false);
        fclose($socket);

        return $name;
    }
}
