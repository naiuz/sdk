<?php

declare(strict_types=1);

/*
 * A local HTTP server for the tests: on each connection it reads the request, sends the first piece, then each
 * further piece a gap apart, then goes silent. It prints its port, and hangs up after 5 seconds, so a client that
 * never times out fails its test instead of hanging it.
 *
 * Usage: php server.php <first piece, base64> <gap in seconds> [<piece, base64>...]
 */

$arguments = [];
foreach (is_array($_SERVER['argv'] ?? null) ? $_SERVER['argv'] : [] as $argument) {
    $arguments[] = is_string($argument) ? $argument : '';
}
$first = base64_decode($arguments[1] ?? '', true);
$gap = (float) ($arguments[2] ?? '0');
$then = array_map(static fn(string $piece): string => (string) base64_decode($piece, true), array_slice($arguments, 3));
$server = stream_socket_server('tcp://127.0.0.1:0', $code, $message);
if ($server === false || $first === false) {
    fwrite(STDERR, "The server couldn't start: {$message}\n");
    exit(1);
}
$name = (string) stream_socket_get_name($server, false);
echo substr($name, (int) strrpos($name, ':') + 1), "\n";
$giveUp = microtime(true) + 5;
$connections = [];
while (microtime(true) < $giveUp) {
    $connection = @stream_socket_accept($server, 0.05);
    if ($connection === false) {
        continue;
    }
    $connections[] = $connection;
    stream_set_timeout($connection, 1);
    fread($connection, 65536);
    fwrite($connection, $first);
    foreach ($then as $piece) {
        usleep((int) ($gap * 1_000_000));
        fwrite($connection, $piece);
    }
}
foreach ($connections as $connection) {
    fclose($connection);
}
