<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use GuzzleHttp\Psr7\Response;
use Naiuz\Core\APIRequest;
use Naiuz\Core\Attempt;
use Naiuz\Core\RetryClass;
use Naiuz\Core\TakeOver;
use Naiuz\Core\Transport\Body;
use Naiuz\Exceptions\APIException;
use Naiuz\Exceptions\APITimeoutException;
use Naiuz\Exceptions\NotFoundException;
use Naiuz\Tests\Support\DripStream;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Psr\Http\Message\ResponseInterface;

final class TakeOverTest extends TestCase
{
    public function test_a_reader_that_takes_the_answer_over_reads_on_past_the_timeout(): void
    {
        $body = new DripStream(['a', 'b'], gap: 0.1);
        $http = (new TestHttp(new MockClient(self::events($body)), timeout: 0.15, maxRetries: 0))->http;
        $read = $http->request(self::stream(), new TakeOver(static function (ResponseInterface $response, Attempt $attempt): string {
            self::assertSame(0.15, $attempt->timeout);
            self::assertSame('Bearer [redacted]', $attempt->redact('Bearer ' . TestHttp::KEY));
            $stream = $response->getBody();
            $content = '';
            while (!$stream->eof()) {
                $content .= Body::piece($stream, 8192);
            }

            return $content;
        }, 'text/event-stream'));
        self::assertSame('ab', $read);
    }

    public function test_the_answer_a_reader_takes_over_is_the_reader_s_to_close(): void
    {
        $body = new DripStream(['{}']);
        $http = (new TestHttp(new MockClient(self::events($body))))->http;
        $response = $http->request(self::stream(), new TakeOver(static fn(ResponseInterface $response, Attempt $attempt): ResponseInterface => $response));
        self::assertFalse($body->closed);
        $response->getBody()->close();
        self::assertTrue($body->closed);
    }

    public function test_the_core_closes_the_answer_when_the_reader_taking_it_over_fails_and_doesn_t_retry(): void
    {
        $body = new DripStream(['{}']);
        $api = new MockClient(self::events($body), self::events(new DripStream(['{}'])));
        $http = (new TestHttp($api))->http;
        $thrown = null;
        try {
            $http->request(self::stream(), new TakeOver(static fn(ResponseInterface $response, Attempt $attempt): never => throw new \LogicException('The reader broke.')));
        } catch (\LogicException $error) {
            $thrown = $error;
        }
        self::assertSame('The reader broke.', $thrown->getMessage());
        self::assertTrue($body->closed);
        self::assertCount(1, $api->requests);
    }

    public function test_an_error_answer_is_thrown_as_usual_and_never_taken_over(): void
    {
        $taken = [];
        $http = (new TestHttp(new MockClient(Replies::apiError(404, 'not_found'))))->http;
        try {
            $http->request(self::stream(), new TakeOver(static function (ResponseInterface $response, Attempt $attempt) use (&$taken): null {
                $taken[] = $response;

                return null;
            }));
            self::fail('The call should have failed.');
        } catch (NotFoundException $error) {
            self::assertSame('not_found', $error->error_code);
        }
        self::assertSame([], $taken);
    }

    public function test_a_success_of_another_media_type_is_read_whole_and_thrown_with_the_key_redacted_unretried(): void
    {
        $page = new Response(200, ['content-type' => 'text/html'], '<html>Bearer ' . TestHttp::KEY . '</html>');
        $api = new MockClient($page, self::events(new DripStream(['{}'])));
        $http = (new TestHttp($api))->http;
        try {
            $http->request(self::stream(), new TakeOver(static fn(ResponseInterface $response, Attempt $attempt): string => 'taken', 'text/event-stream'));
            self::fail('The call should have failed.');
        } catch (APIException $error) {
            self::assertSame([200, 'OK: <html>Bearer [redacted]</html>'], [$error->status, $error->getMessage()]);
        }
        self::assertCount(1, $api->requests);
    }

    public function test_an_answer_that_isn_t_taken_over_is_read_within_the_attempt_s_timeout(): void
    {
        $dripping = new Response(503, ['content-type' => 'application/json'], new DripStream(['{'], gap: 0.02, forever: true));
        $http = (new TestHttp(new MockClient($dripping), timeout: 0.2, maxRetries: 0))->http;
        $this->expectException(APITimeoutException::class);
        $http->request(self::stream(), new TakeOver(static fn(ResponseInterface $response, Attempt $attempt): string => 'taken', 'text/event-stream'));
    }

    private static function stream(): APIRequest
    {
        return new APIRequest('POST', '/chat/completions', RetryClass::Paid, body: ['stream' => true], accept: 'text/event-stream, application/json');
    }

    private static function events(DripStream $body): ResponseInterface
    {
        return new Response(200, ['content-type' => 'text/event-stream; charset=utf-8', 'x-request-id' => 'req-stream'], $body);
    }
}
