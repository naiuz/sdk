<?php

declare(strict_types=1);

namespace Naiuz\Tests\Support;

/**
 * A local HTTP server on 127.0.0.1, run by server.php in a process of its own: it sends its first piece on each
 * connection, then each further piece a gap apart, then goes silent. It hangs up after 5 seconds, so a client that
 * never times out fails its test instead of hanging it.
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
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        if ($socket === false) {
            throw new \RuntimeException("A free port couldn't be found.");
        }
        $name = (string) stream_socket_get_name($socket, false);
        fclose($socket);

        return 'http://' . $name . '/api/v1';
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
