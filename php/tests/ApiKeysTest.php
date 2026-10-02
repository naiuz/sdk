<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\Exceptions\InternalServerException;
use Naiuz\Exceptions\NeuronAIException;
use Naiuz\Resources\ApiKeys;
use Naiuz\Tests\Support\Clients;
use Naiuz\Tests\Support\MockClient;
use Naiuz\Tests\Support\NetworkError;
use Naiuz\Tests\Support\Replies;
use Naiuz\Tests\Support\TestHttp;
use Naiuz\Types\ApiKey;
use Naiuz\Types\ApiKeyAccess;
use Psr\Http\Message\RequestInterface;

final class ApiKeysTest extends TestCase
{
    private const KEY_ID = '01j9zqa1b2c3d4e5f6g7h8j9k0';

    private const PERMISSIONS = ['tts' => 'write', 'voices' => 'read', 'stt' => 'none', 'llm' => 'none', 'embeddings' => 'none', 'rerank' => 'none', 'account' => 'read', 'api_keys' => 'none'];

    public function test_list_pages_through_the_keys(): void
    {
        $api = new MockClient(
            Replies::json(200, ['data' => [self::key()], 'next_cursor' => 'c2', 'request_id' => 'r1']),
            Replies::json(200, ['data' => [self::key(['id' => 'k2'])], 'next_cursor' => null, 'request_id' => 'r2']),
        );
        $ids = [];
        foreach (Clients::on($api)->apiKeys->list(['limit' => 1]) as $key) {
            $ids[] = $key->id;
        }
        self::assertSame([self::KEY_ID, 'k2'], $ids);
        self::assertSame(['/api/v1/api-keys?limit=1', '/api/v1/api-keys?limit=1&cursor=c2'], self::targets($api));
    }

    public function test_create_posts_the_key_and_returns_it_with_its_secret_sending_no_idempotency_key(): void
    {
        $api = new MockClient(Replies::envelope(self::key(['secret' => 'nai_shown_once']), 'req-create', 201));
        $created = Clients::on($api)->apiKeys->create(['name' => 'CI', 'access' => 'restricted', 'permissions' => ['tts' => 'write']]);
        self::assertSame(['nai_shown_once', 'req-create'], [$created->secret, $created->request_id]);
        self::assertSame(['POST', '/api/v1/api-keys'], [$api->requests[0]->getMethod(), $api->requests[0]->getRequestTarget()]);
        self::assertSame('{"name":"CI","access":"restricted","permissions":{"tts":"write"}}', (string) $api->requests[0]->getBody());
        self::assertFalse($api->requests[0]->hasHeader('idempotency-key'));
    }

    public function test_retrieve_and_update_address_the_key_by_id_and_update_sends_only_what_is_passed(): void
    {
        $api = new MockClient(Replies::envelope(self::key()), Replies::envelope(self::key(['enabled' => false])));
        $client = Clients::on($api);
        $client->apiKeys->retrieve(self::KEY_ID);
        $updated = $client->apiKeys->update(self::KEY_ID, ['enabled' => false, 'monthly_spend_limit' => null]);
        self::assertFalse($updated->enabled);
        self::assertSame(['GET', 'PATCH'], [$api->requests[0]->getMethod(), $api->requests[1]->getMethod()]);
        self::assertSame(['/api/v1/api-keys/' . self::KEY_ID, '/api/v1/api-keys/' . self::KEY_ID], self::targets($api));
        self::assertSame('{"enabled":false,"monthly_spend_limit":null}', (string) $api->requests[1]->getBody());
    }

    public function test_revoke_posts_without_a_body_and_returns_nothing(): void
    {
        $api = new MockClient(Replies::noContent());
        Clients::on($api)->apiKeys->revoke(self::KEY_ID);
        self::assertSame(['POST', '/api/v1/api-keys/' . self::KEY_ID . '/revoke', ''], [$api->requests[0]->getMethod(), $api->requests[0]->getRequestTarget(), (string) $api->requests[0]->getBody()]);
        self::assertFalse($api->requests[0]->hasHeader('content-type'));
    }

    public function test_create_is_never_retried_after_a_5xx_or_a_reset_which_could_make_a_second_key(): void
    {
        $api = new MockClient(Replies::apiError(503, 'service_unavailable', ['retry-after' => '0']), NetworkError::reset());
        $keys = new ApiKeys((new TestHttp($api, maxRetries: 2))->http);
        try {
            $keys->create(['name' => 'CI', 'access' => 'full']);
            self::fail('The 503 should have been thrown.');
        } catch (InternalServerException $error) {
            self::assertSame(503, $error->status);
        }
        try {
            $keys->create(['name' => 'CI', 'access' => 'full']);
            self::fail('The reset should have been thrown.');
        } catch (NeuronAIException $error) {
            self::assertSame('Connection error: Connection reset by peer', $error->getMessage());
        }
        self::assertCount(2, $api);
    }

    public function test_create_retries_a_429_and_the_rest_retry_a_reset_as_safe_calls_do(): void
    {
        $api = new MockClient(
            Replies::apiError(429, 'rate_limit_exceeded', ['retry-after' => '0']),
            Replies::envelope(self::key(), status: 201),
            NetworkError::reset(),
            Replies::json(200, ['data' => [], 'next_cursor' => null, 'request_id' => 'r']),
            NetworkError::reset(),
            Replies::envelope(self::key()),
            NetworkError::reset(),
            Replies::envelope(self::key()),
            NetworkError::reset(),
            Replies::noContent(),
        );
        $keys = new ApiKeys((new TestHttp($api, maxRetries: 1))->http);
        $keys->create(['name' => 'CI', 'access' => 'full']);
        $keys->list();
        $keys->retrieve(self::KEY_ID);
        $keys->update(self::KEY_ID, ['name' => 'Renamed']);
        $keys->revoke(self::KEY_ID);
        self::assertCount(10, $api);
    }

    public function test_a_key_without_its_secret_gives_it_back_without_it_and_takes_a_level_the_sdk_doesn_t_know(): void
    {
        $found = ApiKey::from(self::key(['permissions' => [...self::PERMISSIONS, 'tts' => 'admin']]));
        self::assertNull($found->secret);
        self::assertArrayNotHasKey('secret', $found->toArray());
        self::assertSame('admin', $found->permissions->tts);
    }

    public function test_create_and_update_send_every_field_they_are_given(): void
    {
        $api = new MockClient(Replies::envelope(self::key(), status: 201), Replies::envelope(self::key()));
        $client = Clients::on($api);
        $client->apiKeys->create([
            'name' => 'CI',
            'access' => ApiKeyAccess::Restricted,
            'description' => 'Deploys',
            'permissions' => ['tts' => 'write'],
            'expires_at' => '2027-01-01T00:00:00Z',
            'monthly_spend_limit' => 5000,
            'allowed_ips' => ['10.0.0.0/8'],
        ]);
        $client->apiKeys->update(self::KEY_ID, [
            'name' => 'CI',
            'description' => null,
            'access' => 'full',
            'permissions' => ['llm' => 'write'],
            'expires_at' => null,
            'monthly_spend_limit' => null,
            'enabled' => true,
            'allowed_ips' => null,
        ]);
        self::assertSame(
            '{"name":"CI","access":"restricted","description":"Deploys","permissions":{"tts":"write"},"expires_at":"2027-01-01T00:00:00Z","monthly_spend_limit":5000,"allowed_ips":["10.0.0.0/8"]}',
            (string) $api->requests[0]->getBody(),
        );
        self::assertSame(
            '{"name":"CI","description":null,"access":"full","permissions":{"llm":"write"},"expires_at":null,"monthly_spend_limit":null,"enabled":true,"allowed_ips":null}',
            (string) $api->requests[1]->getBody(),
        );
    }

    public function test_update_refuses_a_key_it_doesn_t_take_sending_nothing(): void
    {
        $api = new MockClient();
        try {
            // PHPStan lets an array shape take keys it doesn't name, so only the SDK can catch this one.
            Clients::on($api)->apiKeys->update(self::KEY_ID, ['monthlySpendLimit' => 5]);
            self::fail('The key should have been refused.');
        } catch (NeuronAIException $error) {
            self::assertStringStartsWith('apiKeys->update() takes no parameter "monthlySpendLimit": it takes name, ', $error->getMessage());
        }
        self::assertCount(0, $api);
    }

    /**
     * @param array<string, mixed> $fields
     *
     * @return array<string, mixed>
     */
    private static function key(array $fields = []): array
    {
        return [
            'id' => self::KEY_ID,
            'name' => 'Production',
            'description' => null,
            'masked_key' => 'nai_****k0Zx',
            'access' => 'restricted',
            'permissions' => self::PERMISSIONS,
            'expires_at' => null,
            'allowed_ips' => [],
            'monthly_spend_limit' => null,
            'spent_this_month' => 0,
            'enabled' => true,
            'revoked_at' => null,
            'last_used_at' => null,
            'created_at' => '2026-09-01T12:00:00Z',
            ...$fields,
        ];
    }

    /** @return list<string> */
    private static function targets(MockClient $api): array
    {
        return array_map(static fn(RequestInterface $request): string => $request->getRequestTarget(), $api->requests);
    }
}
