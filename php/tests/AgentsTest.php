<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\Replies;

final class AgentsTest extends TestCase
{
    private const SIGNED_URL = ['signed_url' => 'wss://example.test/session', 'expires_at' => '2026-11-04T10:15:00Z'];

    public function test_signed_url_sends_each_variable_as_its_own_vars_name_beside_the_customer(): void
    {
        $api = new MockClient(Replies::envelope(self::SIGNED_URL));
        Clients::on($api)->agents->signedUrl('agent_1', ['customer_id' => 'crm-42', 'vars' => ['plan' => 'gold', 'seats' => 3, 'trial' => true]]);
        $uri = $api->requests[0]->getUri();
        self::assertStringEndsWith('/agents/agent_1/signed-url', $uri->getPath());
        parse_str($uri->getQuery(), $query);
        self::assertSame(['customer_id' => 'crm-42', 'vars' => ['plan' => 'gold', 'seats' => '3', 'trial' => 'true']], $query);
    }

    public function test_signed_url_sends_no_query_when_given_none(): void
    {
        $api = new MockClient(Replies::envelope(self::SIGNED_URL));
        Clients::on($api)->agents->signedUrl('agent_1');
        self::assertSame('', $api->requests[0]->getUri()->getQuery());
    }
}
