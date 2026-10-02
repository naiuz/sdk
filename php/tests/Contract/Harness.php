<?php

declare(strict_types=1);

namespace Naiuz\Tests\Contract;

use GuzzleHttp\Psr7\Response;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\RateLimitException;
use Naiuz\NeuronAI;
use Naiuz\Page;
use Naiuz\Stream;
use Naiuz\Tests\Support\FormParser;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Spec;
use Naiuz\Types\ApiObject;
use Naiuz\Types\DialogueAudio;
use Naiuz\Types\DialogueTurnTiming;
use Naiuz\Types\SpeechAudio;
use PHPUnit\Framework\Assert;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Replays spec/fixtures through the real client, as spec/fixtures/README.md says.
 */
final class Harness
{
    /** The key every fixture's client is built with. */
    public const FIXTURE_KEY = 'nai_test_fixture_key';

    public const COMPATIBLE_OPERATIONS = ['createChatCompletion', 'listModels', 'createEmbedding', 'rerank'];

    public const PAGE_OPERATIONS = ['listVoices', 'listApiKeys'];

    public const AUDIO_OPERATIONS = ['synthesizeSpeech', 'synthesizeDialogue', 'downloadTtsJobAudio'];

    /**
     * Every fixture file under spec/fixtures, as `<operationId>/<name>.json`, sorted.
     *
     * @return list<string>
     */
    public static function fixtures(): array
    {
        $root = Spec::DIR . '/fixtures/';
        $files = array_map(static fn(string $path): string => substr($path, strlen($root)), glob($root . '*/*.json') ?: []);
        sort($files);

        return $files;
    }

    /**
     * One fixture, decoded.
     *
     * @return array<mixed>
     */
    public static function load(string $file): array
    {
        return Spec::read("fixtures/{$file}");
    }

    /**
     * The PHP method of every operation and helper in spec/operations.json, such as `tts->jobs->create`.
     *
     * @return list<string>
     */
    public static function phpPaths(): array
    {
        $operations = Spec::read('operations.json');
        $entries = [...(array) Spec::at($operations, 'operations'), ...(array) Spec::at($operations, 'helpers')];

        return Spec::strings(array_map(static fn(mixed $entry): mixed => Spec::at($entry, 'php'), array_values($entries)));
    }

    /** The PHP method an operation maps to, such as `tts->jobs->create`. */
    public static function phpPath(string $operationId): string
    {
        $path = Spec::at(Spec::read('operations.json'), 'operations', $operationId, 'php');

        return is_string($path) ? $path : throw new \LogicException("{$operationId} is not in spec/operations.json");
    }

    /** A client as the README says: the fixture key, the default base URL and no retries. */
    public static function client(MockClient $api): NeuronAI
    {
        return new NeuronAI(['api_key' => self::FIXTURE_KEY, 'http_client' => $api, 'max_retries' => 0]);
    }

    /** The method a path such as `tts->jobs->create` names on the client; null when the client has no such method. */
    public static function method(NeuronAI $client, string $path): ?\Closure
    {
        $names = explode('->', $path);
        $method = array_pop($names);
        $target = $client;
        foreach ($names as $name) {
            $target = property_exists($target, $name) ? $target->{$name} : null;
            if (!is_object($target)) {
                return null;
            }
        }

        $callable = [$target, $method];

        return is_callable($callable) ? \Closure::fromCallable($callable) : null;
    }

    /**
     * A fixture's call as the method's arguments: the path parameters in the path's order, then the fields or the
     * query when the operation takes either, each upload as a stream with its filename and content type, then the
     * options.
     *
     * @param array<mixed> $fixture
     *
     * @return list<mixed>
     */
    public static function arguments(array $fixture): array
    {
        $operationId = Spec::text(Spec::at($fixture, 'operationId'));
        [$method, $route] = explode(' ', Spec::text(Spec::at(Spec::read('operations.json'), 'operations', $operationId, 'http')), 2) + [1 => ''];
        preg_match_all('/\{([^}]+)\}/', $route, $names);
        $arguments = array_map(static fn(string $name): mixed => Spec::at($fixture, 'call', 'path_params', $name), $names[1]);
        $described = Spec::at(Spec::read('openapi.json'), 'paths', "/v1{$route}", strtolower($method));
        $takesQuery = array_filter((array) Spec::at($described, 'parameters'), static fn(mixed $parameter): bool => Spec::at($parameter, 'in') === 'query') !== [];
        if (Spec::at($described, 'requestBody') !== null || $takesQuery) {
            $params = (array) Spec::at($fixture, 'call', 'params');
            foreach ((array) Spec::at($fixture, 'call', 'files') as $field => $file) {
                // Left at its end, as a caller who just wrote the bytes leaves it: the SDK reads it from its start.
                $stream = fopen('php://memory', 'w+b');
                if ($stream === false) {
                    throw new \RuntimeException('A memory stream couldn\'t be opened.');
                }
                fwrite($stream, (string) base64_decode(Spec::text(Spec::at($file, 'base64')), true));
                $params[$field] = ['stream' => $stream, 'filename' => Spec::text(Spec::at($file, 'filename')), 'content_type' => Spec::text(Spec::at($file, 'content_type'))];
            }
            $arguments[] = $params;
        }
        $key = Spec::at($fixture, 'call', 'options', 'idempotency_key');
        if ($key !== null) {
            $arguments[] = ['idempotency_key' => $key];
        }

        return $arguments;
    }

    /**
     * The fixture's canned answer.
     *
     * @param array<mixed> $fixture
     */
    public static function response(array $fixture): ResponseInterface
    {
        $body = Spec::at($fixture, 'response', 'body');
        $content = match (true) {
            is_array($body) && array_key_exists('json', $body) => json_encode($body['json'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            is_array($body) && array_key_exists('base64', $body) => (string) base64_decode(Spec::text($body['base64']), true),
            is_array($body) && array_key_exists('sse', $body) => implode('', array_map(static fn(string $data): string => "data: {$data}\n\n", Spec::strings($body['sse']))),
            default => '',
        };
        $headers = array_map(strval(...), array_filter((array) Spec::at($fixture, 'response', 'headers'), is_string(...)));

        return new Response((int) Spec::text(Spec::at($fixture, 'response', 'status')), $headers, $content);
    }

    /**
     * Replays a fixture through a client whose HTTP client answers each request with the fixture's response; a call
     * with `'stream' => true` is read to its end. Throws \LogicException when the client has no method for the
     * operation.
     *
     * @param array<mixed> $fixture
     */
    public static function replay(array $fixture): Replayed
    {
        $answer = static fn(RequestInterface $request): ResponseInterface => self::response($fixture);
        $api = new MockClient($answer, $answer, $answer);
        $operationId = Spec::text(Spec::at($fixture, 'operationId'));
        $path = self::phpPath($operationId);
        $method = self::method(self::client($api), $path) ?? throw new \LogicException("client->{$path} is not on the client");
        try {
            $value = $method(...self::arguments($fixture));
            $result = Spec::at($fixture, 'call', 'params', 'stream') === true ? self::projectStream($value) : self::projectResult($operationId, $value);
        } catch (APIException $error) {
            $result = self::projectError($error);
        }

        return new Replayed($api->requests, $result);
    }

    /**
     * A stream in the README's shape: `{chunks}`, each chunk before `[DONE]` as the stream gives it, and `error` beside
     * the chunks before it when the stream fails part-way. A value that isn't a stream throws.
     *
     * @return array<string, mixed>
     */
    public static function projectStream(mixed $value): array
    {
        if (!$value instanceof Stream) {
            throw new \LogicException("A call with 'stream' => true should return a stream, not " . get_debug_type($value) . '.');
        }
        $chunks = [];
        try {
            foreach ($value as $chunk) {
                $chunks[] = $chunk instanceof ApiObject ? $chunk->toArray() : throw new \LogicException('A chunk should be an object the API sent.');
            }
        } catch (APIException $error) {
            return ['chunks' => $chunks, ...self::projectError($error)];
        }

        return ['chunks' => $chunks];
    }

    /**
     * What the SDK returned, in the README's `result` shape as the operation decides it: audio, a page, a compatible
     * endpoint's `{body, cost}`, any other object's `{data, request_id}`, or null for nothing. A value of another
     * shape throws.
     */
    public static function projectResult(string $operationId, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }
        if (in_array($operationId, self::AUDIO_OPERATIONS, true) !== $value instanceof SpeechAudio) {
            throw new \LogicException(sprintf('%s should %sreturn audio.', $operationId, $value instanceof SpeechAudio ? 'not ' : ''));
        }
        if ($value instanceof SpeechAudio) {
            return self::projectAudio($operationId, $value);
        }
        if (in_array($operationId, self::PAGE_OPERATIONS, true)) {
            return $value instanceof Page ? $value->toArray() : throw new \LogicException("{$operationId} should return a page, but returned " . get_debug_type($value) . '.');
        }
        if ($value instanceof Page || !$value instanceof ApiObject) {
            throw new \LogicException("{$operationId} should return an object, not " . get_debug_type($value) . '.');
        }
        $attached = get_object_vars($value);
        if (in_array($operationId, self::COMPATIBLE_OPERATIONS, true)) {
            return array_key_exists('cost', $attached) ? ['body' => $value->toArray(), 'cost' => $attached['cost']] : throw new \LogicException("{$operationId} should return a compatible body with its cost.");
        }

        return array_key_exists('request_id', $attached) ? ['data' => $value->toArray(), 'request_id' => $attached['request_id']] : throw new \LogicException("{$operationId} should return an object with its request ID.");
    }

    /**
     * Audio in the README's shape: its bytes in base64 and each header's field, and a dialogue's turns and their count.
     *
     * @return array<string, mixed>
     */
    public static function projectAudio(string $operationId, SpeechAudio $audio): array
    {
        $fields = [
            'audio_base64' => base64_encode($audio->audio),
            'content_type' => $audio->content_type,
            'cost' => $audio->cost,
            'character_count' => $audio->character_count,
            'balance' => $audio->balance,
            'voice_custom' => $audio->voice_custom,
            'latency_ms' => $audio->latency_ms,
            'replayed' => $audio->replayed,
            'request_id' => $audio->request_id,
        ];
        if ($operationId !== 'synthesizeDialogue') {
            return $fields;
        }
        if (!$audio instanceof DialogueAudio) {
            throw new \LogicException('synthesizeDialogue should return a DialogueAudio, but didn\'t.');
        }

        return [...$fields, 'turns' => array_map(static fn(DialogueTurnTiming $turn): array => $turn->toArray(), $audio->turns), 'turn_count' => $audio->turn_count];
    }

    /**
     * An exception in the README's `{error: {...}}` shape.
     *
     * @return array{error: array<string, mixed>}
     */
    public static function projectError(APIException $error): array
    {
        return ['error' => [
            'class' => (new \ReflectionClass($error))->getShortName(),
            'status' => $error->status,
            'type' => $error->type,
            'code' => $error->error_code,
            'message' => $error->getMessage(),
            'param' => $error->param,
            'fields' => $error->fields,
            'request_id' => $error->request_id,
            'retry_after' => $error instanceof RateLimitException ? $error->retry_after : null,
        ]];
    }

    /**
     * A fixture's result as PHP gives it: an error's class ends in Exception where the fixture's ends in Error.
     */
    public static function phpResult(mixed $result): mixed
    {
        $class = Spec::at($result, 'error', 'class');
        if (!is_array($result) || !is_array($result['error'] ?? null) || !is_string($class)) {
            return $result;
        }
        $result['error']['class'] = (string) preg_replace('/Error$/', 'Exception', $class);

        return $result;
    }

    /**
     * The result without the fields the fixture's unknown_fields name, taken from the part that mirrors the response
     * body: `body` for a compatible operation, whose cost comes from a header; the whole result otherwise.
     *
     * @param array<mixed> $fixture
     */
    public static function withoutUnknownFields(mixed $result, array $fixture): mixed
    {
        $compatible = in_array(Spec::at($fixture, 'operationId'), self::COMPATIBLE_OPERATIONS, true);
        foreach (Spec::strings(Spec::at($fixture, 'unknown_fields')) as $pointer) {
            $segments = array_map(static fn(string $segment): string => str_replace(['~1', '~0'], ['/', '~'], $segment), explode('/', substr($pointer, 1)));
            $result = self::without($result, $compatible ? ['body', ...$segments] : $segments);
        }

        return $result;
    }

    /**
     * A JSON value ready to compare under the README's rules: a key holding null is dropped, so it matches one that
     * is absent; key order doesn't matter, and numbers compare by value, but a boolean never equals a number.
     */
    public static function comparable(mixed $value): mixed
    {
        return self::normalized($value, dropNulls: true);
    }

    /**
     * A JSON value ready to compare exactly, as a request body is: key order doesn't matter and numbers compare by
     * value, but a boolean never equals a number, and a key holding null never matches one that is absent, since a
     * null in a request is an instruction, such as clearing a key's expiry.
     */
    public static function exact(mixed $value): mixed
    {
        return self::normalized($value, dropNulls: false);
    }

    /**
     * Asserts that exactly one request went out, and that it is the fixture's: the method, the raw request target as
     * sent, the query with every key once, every fixture header with its value, and the body. A JSON body compares null
     * for null. A multipart body's content type only has to start with the fixture's, since the boundary follows it,
     * and its form compares exactly: every field and file, each once, and nothing more.
     *
     * @param list<RequestInterface> $requests
     * @param array<mixed> $expected
     */
    public static function expectRequest(array $requests, array $expected): void
    {
        Assert::assertCount(1, $requests, 'The call sends exactly one request.');
        [$sent] = $requests;
        Assert::assertSame(Spec::at($expected, 'method'), $sent->getMethod());
        Assert::assertSame(['https', 'my.neuronai.uz'], [$sent->getUri()->getScheme(), $sent->getUri()->getHost()]);
        // The raw target, as sent: a URL parser could re-encode the path, which is what the fixture pins.
        Assert::assertSame('/api/v1' . Spec::text(Spec::at($expected, 'path')), explode('?', $sent->getRequestTarget(), 2)[0]);
        // Every pair, sorted, so a key sent twice can't pass for one sent once.
        $query = [];
        foreach ((array) Spec::at($expected, 'query') as $name => $value) {
            $query[] = [(string) $name, Spec::text($value)];
        }
        sort($query);
        Assert::assertSame($query, self::pairs($sent->getUri()->getQuery()));
        $body = Spec::at($expected, 'body');
        $multipart = is_array($body) && array_key_exists('multipart', $body);
        foreach ((array) Spec::at($expected, 'headers') as $name => $value) {
            if ($multipart && $name === 'content-type') {
                $type = Spec::text($value);
                Assert::assertNotSame('', $type);
                Assert::assertStringStartsWith($type, $sent->getHeaderLine('content-type'));
            } else {
                Assert::assertSame($value, $sent->getHeaderLine((string) $name), (string) $name);
            }
        }
        if ($body === null) {
            Assert::assertSame('', (string) $sent->getBody());
        } elseif ($multipart) {
            Assert::assertSame(self::exact($body['multipart']), self::exact(FormParser::parse($sent)));
        } else {
            Assert::assertSame(self::exact(Spec::at($body, 'json')), self::exact(json_decode((string) $sent->getBody(), true, flags: JSON_THROW_ON_ERROR)));
        }
    }

    /**
     * A query string's name-value pairs, decoded and sorted.
     *
     * @return list<array{string, string}>
     */
    private static function pairs(string $query): array
    {
        $pairs = [];
        foreach ($query === '' ? [] : explode('&', $query) as $pair) {
            [$name, $value] = explode('=', $pair, 2) + [1 => ''];
            $pairs[] = [rawurldecode($name), rawurldecode($value)];
        }
        sort($pairs);

        return $pairs;
    }

    /** @param list<string> $segments */
    private static function without(mixed $value, array $segments): mixed
    {
        $name = array_shift($segments);
        if (!is_array($value) || $name === null || !array_key_exists($name, $value)) {
            return $value;
        }
        if ($segments === []) {
            unset($value[$name]);
        } else {
            $value[$name] = self::without($value[$name], $segments);
        }

        return $value;
    }

    private static function normalized(mixed $value, bool $dropNulls): mixed
    {
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }
        if (!is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map(static fn(mixed $item): mixed => self::normalized($item, $dropNulls), $value);
        }
        $normalized = [];
        foreach ($value as $name => $item) {
            if (!$dropNulls || $item !== null) {
                $normalized[$name] = self::normalized($item, $dropNulls);
            }
        }
        ksort($normalized);

        return $normalized;
    }
}
