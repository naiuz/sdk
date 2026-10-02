<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\NeuronAI;
use Naiuz\RawResponse;
use Naiuz\Stream;
use Naiuz\Types\ChatCompletion;
use Naiuz\Types\ChatCompletionChunk;

use function PHPStan\Testing\assertType;

/**
 * What PHPStan infers for a caller's code. PHPStan checks each assertType() as it analyses this file; PHPUnit never
 * runs it, since it holds no test.
 *
 * @phpstan-import-type CreateChatCompletionRequest from \Naiuz\Resources\Completions
 */
final class TypeInference
{
    /** @param CreateChatCompletionRequest $request */
    public static function chat(NeuronAI $client, array $request, bool $stream): void
    {
        $hello = ['model' => 'gemma-4-26b-a4b', 'messages' => [['role' => 'user', 'content' => 'Salom!']]];
        assertType(ChatCompletion::class, $client->chat->completions->create($hello));
        assertType(ChatCompletion::class, $client->chat->completions->create([...$hello, 'stream' => false]));
        assertType(ChatCompletion::class, $client->chat->completions->create([...$hello, 'stream' => null]));
        assertType(Stream::class . '<' . ChatCompletionChunk::class . '>', $client->chat->completions->create([...$hello, 'stream' => true]));
        // A stream known only at run time, or a whole request array, gives either.
        assertType(Stream::class . '<' . ChatCompletionChunk::class . '>|' . ChatCompletion::class, $client->chat->completions->create([...$hello, 'stream' => $stream]));
        assertType(Stream::class . '<' . ChatCompletionChunk::class . '>|' . ChatCompletion::class, $client->chat->completions->create($request));
        foreach ($client->chat->completions->create([...$hello, 'stream' => true]) as $chunk) {
            assertType(ChatCompletionChunk::class, $chunk);
        }
        assertType(RawResponse::class . '<' . Stream::class . '<' . ChatCompletionChunk::class . '>|' . ChatCompletion::class . '>', $client->withRawResponse()->chat->completions->create($hello));
    }
}
