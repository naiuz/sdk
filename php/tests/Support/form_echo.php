<?php

declare(strict_types=1);

/*
 * A form reader for the tests, run by PHP's built-in web server: it answers with the form PHP itself parsed from the
 * request, as the API's server, which runs on PHP, reads one: each field, and each file's name, type and bytes.
 */

$files = [];
foreach ($_FILES as $name => $file) {
    $path = is_array($file) && is_string($file['tmp_name'] ?? null) ? $file['tmp_name'] : '';
    $files[$name] = [
        'name' => is_array($file) ? $file['name'] ?? null : null,
        'type' => is_array($file) ? $file['type'] ?? null : null,
        'base64' => $path === '' ? null : base64_encode((string) file_get_contents($path)),
    ];
}
header('Content-Type: application/json');
echo json_encode(['fields' => $_POST, 'files' => $files], JSON_THROW_ON_ERROR);
