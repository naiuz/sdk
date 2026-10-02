<?php

declare(strict_types=1);

/*
 * A local HTTP server for the tests. It prints its port, then serves each connection in turn by the next plan: it
 * reads the request, sends the plan's first piece, then each further piece a gap apart, then goes silent. A plan that
 * repeats sends its last piece again every gap instead, until the client hangs up, and then prints "closed". The last
 * plan serves every connection after it. It hangs up after 5 seconds, so a client that never times out fails its test
 * instead of hanging it.
 *
 * Usage: php server.php <plan>...
 * A plan is base64 of JSON: {"pieces": [<piece, base64>...], "gap": <seconds>, "repeat": <bool>}.
 */

$plans = [];
foreach (array_slice(is_array($_SERVER['argv'] ?? null) ? $_SERVER['argv'] : [], 1) as $argument) {
    $plan = json_decode((string) base64_decode(is_string($argument) ? $argument : '', true), true);
    $pieces = is_array($plan) && is_array($plan['pieces'] ?? null) ? $plan['pieces'] : [];
    $plans[] = [
        'pieces' => array_map(static fn(mixed $piece): string => (string) base64_decode(is_string($piece) ? $piece : '', true), $pieces),
        'gap' => is_array($plan) && is_numeric($plan['gap'] ?? null) ? (float) $plan['gap'] : 0.0,
        'repeat' => is_array($plan) && ($plan['repeat'] ?? false) === true,
    ];
}
$server = stream_socket_server('tcp://127.0.0.1:0', $code, $message);
if ($server === false || $plans === []) {
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
    $plan = $plans[min(count($connections), count($plans) - 1)];
    $connections[] = $connection;
    stream_set_timeout($connection, 1);
    fread($connection, 65536);
    foreach ($plan['pieces'] as $n => $piece) {
        if ($n > 0) {
            usleep((int) ($plan['gap'] * 1_000_000));
        }
        fwrite($connection, $piece);
    }
    while ($plan['repeat'] && microtime(true) < $giveUp) {
        // The client sends nothing more, so the connection turns readable only when the client hangs up.
        $ready = [$connection];
        $none = null;
        if (stream_select($ready, $none, $none, 0, (int) ($plan['gap'] * 1_000_000)) === 1 && in_array(fread($connection, 8192), ['', false], true)) {
            echo "closed\n";
            break;
        }
        fwrite($connection, (string) end($plan['pieces']));
    }
}
foreach ($connections as $connection) {
    fclose($connection);
}
