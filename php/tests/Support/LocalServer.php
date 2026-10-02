<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

/**
 * A local HTTP server on 127.0.0.1, run by server.php in a process of its own: it sends its first piece on each
 * connection, then each further piece a gap apart, then goes silent. It hangs up after 5 seconds, so a client that
 * never times out fails its test instead of hanging it. php() runs PHP's own web server on a script instead.
 */
final class LocalServer
{
    /** @param resource $process */
    private function __construct(private $process, public readonly string $baseUrl) {}

    public static function start(string $first, float $gap = 0.0, string ...$then): self
    {
        $command = [PHP_BINARY, __DIR__ . '/server.php', base64_encode($first), (string) $gap, ...array_map(base64_encode(...), array_values($then))];
        $process = proc_open($command, [1 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) {
            throw new \RuntimeException("The local server couldn't start.");
        }
        $port = trim((string) fgets($pipes[1]));
        if (preg_match('/^\d+$/', $port) !== 1) {
            throw new \RuntimeException("The local server didn't say its port.");
        }

        return new self($process, "http://127.0.0.1:{$port}/api/v1");
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
}
