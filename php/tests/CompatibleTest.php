<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Exceptions\InternalServerException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\NeuronAI;
use Naiuz\Resources\Completions;
use Naiuz\Resources\Embeddings;
use Naiuz\Resources\Models;
use Naiuz\Resources\Rerank;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Types\RerankResult;

final class CompatibleTest extends TestCase
{
    private const MODELS = ['object' => 'list', 'data' => [['id' => 'gemma-4-26b-a4b', 'object' => 'model', 'created' => 0, 'owned_by' => 'neuronai']]];

    private const EMBEDDINGS = [
        'object' => 'list',
        'model' => 'bge-m3',
        'data' => [['object' => 'embedding', 'index' => 0, 'embedding' => [0.1, -0.2]]],
        'usage' => ['prompt_tokens' => 4, 'total_tokens' => 4],
    ];

    private const RANKED = [
        'id' => 'r1',
        'model' => 'bge-reranker-v2-m3',
        'results' => [['index' => 1, 'relevance_score' => 0.9], ['index' => 0, 'relevance_score' => 0.2, 'document' => ['text' => 'd']]],
        'meta' => ['billed_units' => ['search_units' => 1, 'input_tokens' => 3]],
        'usage' => ['prompt_tokens' => 3, 'total_tokens' => 3],
    ];

    private const COMPLETION = [
        'id' => 'chatcmpl-1',
        'object' => 'chat.completion',
        'created' => 1790000000,
        'model' => 'gemma-4-26b-a4b',
        'choices' => [['index' => 0, 'message' => ['role' => 'assistant', 'content' => 'Salom!'], 'finish_reason' => 'stop']],
        'usage' => ['prompt_tokens' => 9, 'completion_tokens' => 2, 'total_tokens' => 11],
    ];

    private const HELLO = ['model' => 'gemma-4-26b-a4b', 'messages' => [['role' => 'user', 'content' => 'Salom!']]];

    public function test_models_list_returns_the_body_as_it_is_without_a_cost(): void
    {
        $api = new MockClient(Replies::json(200, self::MODELS));
        $models = Clients::on($api)->models->list();
        self::assertSame(['gemma-4-26b-a4b', null], [$models->data[0]->id, $models->cost]);
        self::assertSame(self::MODELS, $models->toArray());
        self::assertSame(['GET', '/api/v1/models'], [$api->requests[0]->getMethod(), $api->requests[0]->getRequestTarget()]);
    }

    public function test_embeddings_create_returns_the_body_with_the_cost_from_x_cost(): void
    {
        $api = new MockClient(Replies::json(200, self::EMBEDDINGS, ['x-cost' => '0.02']));
        $embeddings = Clients::on($api)->embeddings->create(['model' => 'bge-m3', 'input' => 'Salom']);
        self::assertSame([[0.1, -0.2], 0.02], [$embeddings->data[0]->embedding, $embeddings->cost]);
        self::assertSame('{"model":"bge-m3","input":"Salom"}', (string) $api->requests[0]->getBody());
        self::assertSame('/api/v1/embeddings', $api->requests[0]->getRequestTarget());
    }

    public function test_rerank_create_returns_the_results_in_the_server_s_order_with_the_cost(): void
    {
        $api = new MockClient(Replies::json(200, self::RANKED, ['x-cost' => '0.05']));
        $ranked = Clients::on($api)->rerank->create(['model' => 'bge-reranker-v2-m3', 'query' => 'Poytaxt?', 'documents' => ['a', 'b'], 'return_documents' => false]);
        self::assertSame([1, 0], array_map(static fn(RerankResult $result): int => $result->index, $ranked->results));
        self::assertSame([null, 'd', 0.05], [$ranked->results[0]->document, $ranked->results[1]->document?->text, $ranked->cost]);
        self::assertSame('{"model":"bge-reranker-v2-m3","query":"Poytaxt?","documents":["a","b"],"return_documents":false}', (string) $api->requests[0]->getBody());
    }

    public function test_chat_completions_create_returns_the_completion_with_the_cost(): void
    {
        $api = new MockClient(Replies::json(200, self::COMPLETION, ['x-cost' => '0.34']));
        $completion = Clients::on($api)->chat->completions->create(self::HELLO);
        self::assertSame(['Salom!', 11, 0.34], [$completion->choices[0]->message->content, $completion->usage->total_tokens, $completion->cost]);
        self::assertSame(['POST', '/api/v1/chat/completions'], [$api->requests[0]->getMethod(), $api->requests[0]->getRequestTarget()]);
        self::assertSame('{"model":"gemma-4-26b-a4b","messages":[{"role":"user","content":"Salom!"}]}', (string) $api->requests[0]->getBody());
    }

    public function test_chat_completions_create_refuses_a_stream_that_isn_t_true_false_or_null_before_sending_anything(): void
    {
        $api = new MockClient();
        foreach ([1, 'yes', 'true'] as $stream) {
            try {
                // @phpstan-ignore argument.type (an untyped caller's truthy values, such as a form's)
                Clients::on($api)->chat->completions->create([...self::HELLO, 'stream' => $stream]);
                self::fail('The value should have been refused.');
            } catch (NeuronAIException $error) {
                self::assertSame('stream must be true, false or null: it decides whether the answer comes as a stream.', $error->getMessage());
            }
        }
        self::assertCount(0, $api);
    }

    public function test_chat_completions_create_sends_stream_false_as_given(): void
    {
        $api = new MockClient(Replies::json(200, self::COMPLETION));
        Clients::on($api)->chat->completions->create([...self::HELLO, 'stream' => false]);
        self::assertStringEndsWith(',"stream":false}', (string) $api->requests[0]->getBody());
    }

    public function test_chat_completions_create_sends_every_field_it_is_given(): void
    {
        $api = new MockClient(Replies::json(200, self::COMPLETION), Replies::json(200, self::COMPLETION));
        $client = Clients::on($api);
        $client->chat->completions->create([...self::HELLO, 'max_tokens' => 64, 'temperature' => 0.5, 'top_p' => 1, 'stop' => "\n", 'stream' => null]);
        $client->chat->completions->create([...self::HELLO, 'stop' => ['END', ' ']]);
        self::assertSame('{"model":"gemma-4-26b-a4b","messages":[{"role":"user","content":"Salom!"}],"max_tokens":64,"temperature":0.5,"top_p":1,"stop":"\n","stream":null}', (string) $api->requests[0]->getBody());
        self::assertStringEndsWith(',"stop":["END"," "]}', (string) $api->requests[1]->getBody());
    }

    public function test_a_body_field_named_cost_stays_in_the_body_and_apart_from_the_price(): void
    {
        $api = new MockClient(Replies::json(200, [...self::COMPLETION, 'cost' => 111], ['x-cost' => '0.34']));
        $completion = Clients::on($api)->chat->completions->create(self::HELLO);
        self::assertSame(0.34, $completion->cost);
        self::assertSame(111, $completion->toArray()['cost'] ?? null);
    }

    public function test_the_paid_calls_retry_a_5xx_in_the_api_s_envelope_but_never_a_bare_502_or_a_reset(): void
    {
        $calls = [
            static fn(TestHttp $test): mixed => (new Embeddings($test->http))->create(['model' => 'bge-m3', 'input' => 'x']),
            static fn(TestHttp $test): mixed => (new Rerank($test->http))->create(['model' => 'm', 'query' => 'q', 'documents' => ['d']]),
            static fn(TestHttp $test): mixed => (new Completions($test->http))->create(self::HELLO),
        ];
        $bodies = [self::EMBEDDINGS, self::RANKED, self::COMPLETION];
        foreach ($calls as $n => $call) {
            $api = new MockClient(Replies::apiError(500, 'server_error'), Replies::json(200, $bodies[$n]), new Response(502, [], '<html>Bad Gateway</html>'), NetworkError::reset());
            $test = new TestHttp($api, maxRetries: 2);
            $call($test);
            try {
                $call($test);
                self::fail('The bare 502 should not have been retried.');
            } catch (InternalServerException $error) {
                self::assertNull($error->error_code);
            }
            try {
                $call($test);
                self::fail('The reset should not have been retried.');
            } catch (NeuronAIException $error) {
                self::assertSame('Connection error: Connection reset by peer', $error->getMessage());
            }
            self::assertCount(4, $api);
        }
    }

    public function test_models_list_retries_a_reset_as_safe_calls_do(): void
    {
        $api = new MockClient(NetworkError::reset(), Replies::json(200, self::MODELS));
        (new Models((new TestHttp($api, maxRetries: 1))->http))->list();
        self::assertCount(2, $api);
    }

    public function test_with_raw_response_gives_a_compatible_result_with_its_status_and_headers(): void
    {
        $raw = Clients::on(new MockClient(Replies::json(200, self::EMBEDDINGS, ['x-cost' => '0.02', 'x-request-id' => 'req-raw'])))->withRawResponse()->embeddings->create(['model' => 'bge-m3', 'input' => ['a', 'b']]);
        self::assertSame([0.02, 200, '0.02', 'req-raw'], [$raw->data->cost, $raw->status, $raw->headers['x-cost'] ?? null, $raw->headers['x-request-id'] ?? null]);
    }

    public function test_each_create_refuses_a_key_it_doesn_t_take_such_as_a_camel_case_one(): void
    {
        $client = new NeuronAI(['api_key' => TestHttp::KEY, 'http_client' => new MockClient()]);
        try {
            // PHPStan lets an array shape take keys it doesn't name, so only the SDK can catch this one.
            $client->chat->completions->create([...self::HELLO, 'maxTokens' => 64]);
            self::fail('The key should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame('chat->completions->create() takes no parameter "maxTokens": it takes model, messages, max_tokens, temperature, top_p, stop and stream.', $error->getMessage());
        }
    }
}
