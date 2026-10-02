<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Resources\Account;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;

final class AccountTest extends TestCase
{
    private const BALANCE = ['balance' => 10000, 'formatted' => '10 000 UZS', 'currency' => 'UZS', 'stt_price_per_minute' => 500, 'tts_price_per_char' => 2.5, 'min_topup' => 5000];

    private const USAGE = [
        'period' => ['days' => 7, 'start' => '2026-09-23', 'end' => '2026-09-29'],
        'total' => ['requests' => 2, 'cost' => 25, 'formatted_cost' => '25 UZS', 'currency' => 'UZS'],
        'by_service' => [['service' => 'tts', 'label' => 'Text to speech', 'requests' => 2, 'cost' => 25]],
        'by_key' => [['id' => null, 'name' => 'Dashboard', 'requests' => 2, 'cost' => 25]],
    ];

    public function test_balance_reads_get_balance(): void
    {
        $api = new MockClient(Replies::envelope(self::BALANCE, 'req-balance'));
        $balance = Clients::on($api)->account->balance();
        self::assertSame(self::BALANCE, $balance->toArray());
        self::assertSame([10000.0, 2.5, 'req-balance'], [$balance->balance, $balance->tts_price_per_char, $balance->request_id]);
        self::assertSame(['GET', '/api/v1/balance'], [$api->requests[0]->getMethod(), $api->requests[0]->getRequestTarget()]);
    }

    public function test_usage_sends_days_as_the_query_and_no_query_when_it_is_left_out(): void
    {
        $api = new MockClient(Replies::envelope(self::USAGE), Replies::envelope(self::USAGE));
        $client = Clients::on($api);
        $usage = $client->account->usage(['days' => 7]);
        $client->account->usage();
        self::assertNull($usage->by_key[0]->id);
        self::assertSame([7, 'tts', 25.0], [$usage->period->days, $usage->by_service[0]->service, $usage->total->cost]);
        self::assertSame(['/api/v1/usage?days=7', '/api/v1/usage'], [$api->requests[0]->getRequestTarget(), $api->requests[1]->getRequestTarget()]);
    }

    public function test_usage_refuses_a_parameter_it_doesn_t_take_sending_nothing(): void
    {
        $api = new MockClient();
        try {
            Clients::on($api)->account->usage(['day' => 7]);
            self::fail('The parameter should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertSame('account->usage() takes no parameter "day": it takes days.', $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    public function test_both_retry_a_reset_as_safe_calls_do(): void
    {
        $api = new MockClient(NetworkError::reset(), Replies::envelope(self::BALANCE), NetworkError::reset(), Replies::envelope(self::USAGE));
        $account = new Account((new TestHttp($api, maxRetries: 1))->http);
        $account->balance();
        $account->usage();
        self::assertCount(4, $api);
    }

    public function test_with_raw_response_gives_the_result_with_its_status_and_headers(): void
    {
        $raw = Clients::on(new MockClient(Replies::envelope(self::BALANCE, 'req-raw')))->withRawResponse()->account->balance();
        self::assertSame(10000.0, $raw->data->balance);
        self::assertSame([200, 'req-raw', 'req-raw'], [$raw->status, $raw->headers['x-request-id'] ?? null, $raw->data->request_id]);
    }

    public function test_a_per_call_option_the_call_doesn_t_take_is_refused(): void
    {
        $this->expectException(NeuronAIException::class);
        $this->expectExceptionMessage('Unknown option "idempotency_key": a call takes timeout, max_retries and extra_headers.');
        Clients::on(new MockClient())->account->balance(['idempotency_key' => 'k']);
    }
}
